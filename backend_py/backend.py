import os
import ast
import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from supabase import create_client
from insightface.app import FaceAnalysis

from fastapi.middleware.cors import CORSMiddleware


# -----------------------
# ENV + APP INIT
# -----------------------
load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # allow all origins
    allow_credentials=True,
    allow_methods=["*"],      # allow all HTTP methods
    allow_headers=["*"],      # allow all headers
)

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

# -----------------------
# FACE MODEL INIT (ONCE)
# -----------------------
face_app = FaceAnalysis(name="buffalo_l")
face_app.prepare(ctx_id=0, det_size=(640, 640))

# -----------------------
# UTIL FUNCTIONS
# -----------------------
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


# -----------------------
# LOAD EMBEDDINGS (CACHE)
# -----------------------
def load_user_embeddings():
    response = supabase.table("face_embeddings") \
        .select("user_id, embedding") \
        .execute()

    rows = response.data or []

    return {
        row["user_id"]: [float(x) for x in ast.literal_eval(row["embedding"])]
        for row in rows
    }




# -----------------------
# API MODELS
# -----------------------
class VerifyRequest(BaseModel):
    img_hex: str


# -----------------------
# ROUTES
# -----------------------
@app.get("/health")
def health():
    return {
        "status": "OK"
    }


@app.post("/verify")
def verify(data: VerifyRequest):
    img_hex = data.img_hex.replace(" ", "").replace("\n", "")
    user_embeddings = load_user_embeddings()
    try:
        image_bytes = bytes.fromhex(img_hex)
        query_embedding = image_to_embedding(image_bytes)
    except Exception as e:
        return {
            "user_id": -1,
            "score": 0.0,
            "error": str(e)
        }

    best_user = -1
    best_score = 0.0
    THRESHOLD = 0.6  # tune later

    for user_id, db_embedding in user_embeddings.items():
        score = cosine_similarity(query_embedding, db_embedding)
        if score > best_score:
            best_score = score
            best_user = user_id

    if best_score < THRESHOLD:
        print(best_user,best_score)
        return {
            "user_id": -1,
            "score": best_score
        }
    print(best_user,best_score)
    return {
        "user_id": best_user,
        "score": best_score
    }

@app.post("/add")
def add(data: VerifyRequest):
    try:
        img_hex = data.img_hex.replace(" ", "").replace("\n", "")
        image_bytes = bytes.fromhex(img_hex)
        query_embedding = image_to_embedding(image_bytes)
        embedding_floats = [float(x) for x in query_embedding]

        import uuid
        user_id = str(uuid.uuid4())
        print(f"🆕 Adding user: {user_id}")

        # ✅ FIXED: Supabase v2 correct syntax
        response = supabase.table("face_embeddings").insert({
            "user_id": user_id,
            "embedding": embedding_floats
        }).execute()

        # ✅ FIXED: v2 error checking
        if hasattr(response, 'model') and response.model.error:
            print(f"❌ Supabase error: {response.model.error}")
            return {
                "success": False,
                "error": str(response.model.error)
            }
        elif response.data is None or len(response.data) == 0:
            print("❌ No data inserted")
            return {
                "success": False,
                "error": "Failed to insert embedding"
            }

        print(f"✅ Success: {user_id}")
        return {
            "success": True,
            "data": response.data,
            "user_id": user_id
        }
    except Exception as e:
        print(f"💥 Exception: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }
