import os
import ast
import cv2
import json
import ssl
import time
import base64
import threading
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from supabase import create_client
from insightface.app import FaceAnalysis
import paho.mqtt.client as mqtt
from fastapi.middleware.cors import CORSMiddleware

# ===============================
# ENV + APP INIT
# ===============================
load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===============================
# PATH CONFIG (ABSOLUTE)
# ===============================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(BASE_DIR, "images")
os.makedirs(IMAGES_DIR, exist_ok=True)

# ===============================
# SUPABASE
# ===============================
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

# ===============================
# FACE MODEL (LOAD ONCE)
# ===============================
face_app = FaceAnalysis(name="buffalo_l")
face_app.prepare(ctx_id=0, det_size=(640, 640))

# ===============================
# MQTT CONFIG
# ===============================

# PUBLIC (IMAGE CHUNKS)
PUBLIC_BROKER = "broker.hivemq.com"
PUBLIC_PORT = 1883
IMAGE_TOPIC = "image/chunk"

# PRIVATE (METADATA)
PRIVATE_BROKER = "7dd05234a60b4fe1b00f43208122cd43.s1.eu.hivemq.cloud"
PRIVATE_PORT = 8883
META_TOPIC = "iot/camera/rfid_access"

MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")

# ===============================
# MQTT STATE
# ===============================
image_chunks = {}     # {image_id: {"total": int, "chunks": {idx: b64}}}
image_status = {}     # {image_id: True/False}

# ===============================
# IMAGE CHUNK HANDLER
# ===============================
def on_image_message(client, userdata, msg):
    payload = json.loads(msg.payload.decode())

    image_id = payload["image_id"]
    idx = payload["index"]
    total = payload["total"]
    data = payload["data"]

    if image_id not in image_chunks:
        image_chunks[image_id] = {"total": total, "chunks": {}}

    image_chunks[image_id]["chunks"][idx] = data

    if len(image_chunks[image_id]["chunks"]) == total:
        assemble_and_save(image_id)

def assemble_and_save(image_id):
    chunks = image_chunks[image_id]["chunks"]
    b64_full = "".join(chunks[i] for i in range(len(chunks)))
    img_bytes = base64.b64decode(b64_full)

    path = os.path.join(IMAGES_DIR, f"{image_id}.jpg")
    with open(path, "wb") as f:
        f.write(img_bytes)

    print(f"[IMAGE] Saved {path}")
    del image_chunks[image_id]

# ===============================
# META HANDLER
# ===============================
def poll_until_image_exists(img_id, timeout=20):
    start = time.time()
    path = os.path.join(IMAGES_DIR, f"{img_id}.jpg")

    while time.time() - start < timeout:
        if os.path.exists(path):
            image_status[img_id] = True
            print(f"[VERIFY] Image {img_id} verified ✅")
            return
        time.sleep(0.5)

    image_status[img_id] = False
    print(f"[VERIFY] Image {img_id} NOT found ❌")

def on_meta_message(client, userdata, msg):
    payload = json.loads(msg.payload.decode())
    img_id = payload.get("img_id")

    if not img_id:
        return

    print(f"[META] Received img_id={img_id}")
    threading.Thread(
        target=poll_until_image_exists,
        args=(img_id,),
        daemon=True
    ).start()

# ===============================
# MQTT STARTUP (CRITICAL)
# ===============================
@app.on_event("startup")
def start_mqtt():
    # PUBLIC IMAGE CLIENT
    image_client = mqtt.Client()
    image_client.on_message = on_image_message
    image_client.connect(PUBLIC_BROKER, PUBLIC_PORT, 60)
    image_client.subscribe(IMAGE_TOPIC, qos=0)
    image_client.loop_start()

    # PRIVATE META CLIENT
    meta_client = mqtt.Client()
    meta_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    meta_client.tls_set(
        cert_reqs=ssl.CERT_REQUIRED,
        tls_version=ssl.PROTOCOL_TLSv1_2
    )
    meta_client.tls_insecure_set(False)
    meta_client.on_message = on_meta_message
    meta_client.connect(PRIVATE_BROKER, PRIVATE_PORT, 60)
    meta_client.subscribe(META_TOPIC, qos=1)
    meta_client.loop_start()

    print("✅ MQTT clients started")

# ===============================
# FACE UTILS
# ===============================
def image_to_embedding(image_bytes: bytes) -> list[float]:
    np_img = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Invalid image")

    faces = face_app.get(img)
    if not faces:
        raise ValueError("No face detected")

    embedding = faces[0].embedding
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()

def cosine_similarity(a, b) -> float:
    a = np.array(a)
    b = np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def load_user_embeddings():
    response = supabase.table("face_embeddings") \
        .select("user_id, embedding") \
        .execute()

    rows = response.data or []
    return {
        row["user_id"]: [float(x) for x in ast.literal_eval(row["embedding"])]
        for row in rows
    }

# ===============================
# API MODELS
# ===============================
class VerifyRequest(BaseModel):
    img_id: str

# ===============================
# ROUTES
# ===============================
@app.get("/health")
def health():
    return {"status": "OK"}

@app.get("/status/{img_id}")
def status(img_id: str):
    path = os.path.join(IMAGES_DIR, f"{img_id}.jpg")
    return {
        "img_id": img_id,
        "exists": os.path.exists(path),
        "verified": image_status.get(img_id, False)
    }

@app.post("/verify")
def verify(data: VerifyRequest):
    image_path = os.path.join(IMAGES_DIR, f"{data.img_id}.jpg")

    if not os.path.exists(image_path):
        return {"user_id": -1, "error": "Image not found"}

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    try:
        query_embedding = image_to_embedding(image_bytes)
    except Exception as e:
        return {"user_id": -1, "error": str(e)}

    user_embeddings = load_user_embeddings()
    best_user = -1
    best_score = 0.0
    THRESHOLD = 0.6

    for user_id, db_embedding in user_embeddings.items():
        score = cosine_similarity(query_embedding, db_embedding)
        if score > best_score:
            best_score = score
            best_user = user_id

    if best_score < THRESHOLD:
        return {"user_id": -1, "score": best_score}

    return {"user_id": best_user, "score": best_score}

@app.post("/add")
def add(data: VerifyRequest):
    try:
        # 1️⃣ Convert hex → bytes → embedding
        img_hex = data.img_id.replace(" ", "").replace("\n", "")

        image_bytes = bytes.fromhex(img_hex)
        query_embedding = image_to_embedding(image_bytes)
        embedding = [float(x) for x in query_embedding]

        # 2️⃣ Insert into Supabase
        import uuid

        user_id = str(uuid.uuid4())

        response=supabase.table("face_embeddings").insert({
            "user_id": user_id,
            "embedding": embedding
        }).execute()
        print(response.data)
        # 3️⃣ Validate insert
        if not response.data:
            return {"success": False}

        return {"success": True}

    except Exception as e:
        print("ADD ERROR:", e)
        return {"success": False, "error": str(e)}
