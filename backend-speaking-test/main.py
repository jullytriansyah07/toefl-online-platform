from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import urllib.parse
import json
import mysql.connector
from fpdf import FPDF
from groq import AsyncGroq
import bcrypt
import jwt
import datetime

# =========================================================
GROQ_API_KEY = "API_KEY_NANTI_DISIMPAN_DI_SERVER"
JWT_SECRET = "kunci_rahasia_toefl_super_aman_123" # Kunci untuk membuat Token
# =========================================================

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
client = AsyncGroq(api_key=GROQ_API_KEY)

# --- KONEKSI DATABASE ---
def get_db_connection():
    return mysql.connector.connect(host="localhost", user="root", password="", database="toefl_platform")

# --- SISTEM AUTENTIKASI (LOGIN & REGISTER) ---
@app.post("/api/register")
def register_user(full_name: str = Form(...), email: str = Form(...), password: str = Form(...)):
    try:
        db = get_db_connection()
        cursor = db.cursor()
        
        # Cek apakah email sudah terdaftar
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            return {"error": "Email sudah terdaftar!"}
            
        # Acak Password (Hashing)
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Simpan ke database dengan role default 'peserta'
        cursor.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, 'peserta')", 
                       (full_name, email, hashed_password))
        db.commit()
        db.close()
        return {"message": "Registrasi berhasil! Silakan Login."}
    except Exception as e:
        return {"error": f"Gagal registrasi: {str(e)}"}

@app.post("/api/login")
def login_user(email: str = Form(...), password: str = Form(...)):
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        db.close()
        
        # Cek keberadaan user & cocokkan password
        if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return {"error": "Email atau Password salah!"}
            
        # Buat Karcis Token JWT (Berlaku 24 Jam)
        token_payload = {
            "user_id": user['id'],
            "full_name": user['full_name'],
            "role": user['role'],
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }
        token = jwt.encode(token_payload, JWT_SECRET, algorithm="HS256")
        
        # Kirim token dan data dasar ke React
        return {
            "message": "Login berhasil",
            "token": token,
            "user": {"full_name": user['full_name'], "role": user['role']}
        }
    except Exception as e:
        return {"error": f"Gagal login: {str(e)}"}

# --- FUNGSI VALIDASI TOKEN JWT ---
def verify_token(authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Akses ditolak! Karcis Token tidak ditemukan.")
    try:
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi login habis, silakan login ulang.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid!")

# --- ENDPOINT UJIAN (HANYA BISA DIAKSES JIKA BAWA TOKEN) ---
@app.post("/api/evaluate-speech")
async def evaluate_speech(
    audio: UploadFile = File(...),
    question: str = Form(...),
    authorization: str = Header(None) # Menerima Token dari React
):
    try:
        # 1. Validasi Token Dulu (Siapa yang sedang ujian?)
        user_data = verify_token(authorization)
        student_name = user_data['full_name'] # Nama diambil otomatis dari akun, bukan ketikan manual!

        audio_bytes = await audio.read()
        
        # TAHAP 1: GROQ WHISPER
        transcription = await client.audio.transcriptions.create(
            file=("audio.webm", audio_bytes), model="whisper-large-v3", language="en", response_format="json"
        )
        user_transcript = transcription.text
            
        # TAHAP 2: EVALUASI LLM
        prompt = f"""
        You are an expert official TOEFL iBT Speaking evaluator. 
        Question Asked: "{question}"
        Student's Answer: "{user_transcript}"
        Instructions:
        1. Evaluate based on Topic Development, Delivery, and Language Use.
        2. Give the FINAL SCALED SCORE from 0 to 30. 
        3. Provide 1 short sentence of constructive feedback.
        Return ONLY a JSON: {{"score": 28, "feedback": "Feedback here", "transcript": "{user_transcript}"}}
        """
        
        chat_completion = await client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}], model="openai/gpt-oss-120b", temperature=0.1
        )
        clean_text = chat_completion.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        ai_result = json.loads(clean_text)
            
        skor = int(ai_result.get("score", 0))
        feedback = ai_result.get("feedback", "")
        
        # SIMPAN KE DATABASE
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute("INSERT INTO student_scores (student_name, question, transcript, score, feedback) VALUES (%s, %s, %s, %s, %s)", 
                       (student_name, question, user_transcript, skor, feedback))
        db.commit()
        db.close()
        
        # RAKIT URL PDF
        ai_result["certificateUrl"] = f"http://localhost:8000/api/certificate?score={skor}&name={urllib.parse.quote(student_name)}"
        return ai_result

    except HTTPException as he:
        return {"error": he.detail}
    except Exception as e:
        return {"error": f"Error Sistem Python: {str(e)}"}

# --- ENDPOINT ADMIN (HANYA BISA DIAKSES ROLE 'ADMIN') ---
@app.get("/api/history")
def get_score_history(authorization: str = Header(None)):
    user_data = verify_token(authorization)
    if user_data['role'] != 'admin':
        return {"error": "Akses Ditolak! Anda bukan Admin."}
        
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT id, student_name, score, transcript, feedback, exam_date FROM student_scores ORDER BY exam_date DESC LIMIT 50")
        results = cursor.fetchall()
        db.close()
        for row in results:
            if 'exam_date' in row and row['exam_date']:
                row['exam_date'] = row['exam_date'].strftime("%Y-%m-%d %H:%M:%S")
        return {"data": results}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/history/{record_id}")
def delete_score_history(record_id: int, authorization: str = Header(None)):
    user_data = verify_token(authorization)
    if user_data['role'] != 'admin':
        return {"error": "Akses Ditolak! Hanya admin yang bisa menghapus."}
        
    try:
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute("DELETE FROM student_scores WHERE id = %s", (record_id,))
        db.commit()
        db.close()
        return {"message": "Data berhasil dihapus"}
    except Exception as e:
        return {"error": str(e)}

# --- GENERATOR PDF ---
@app.get("/api/certificate")
def generate_certificate(score: str = "0", name: str = "Student Name"):
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_line_width(3)
    pdf.set_draw_color(15, 32, 67)
    pdf.rect(10, 10, 277, 190)
    
    pdf.set_y(40)
    pdf.set_font("helvetica", "B", 32)
    pdf.set_text_color(15, 32, 67)
    pdf.cell(0, 20, "TOEFL SPEAKING CERTIFICATE", align="C", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "", 18)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 15, "This is to proudly certify that", align="C", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "B", 40)
    pdf.set_text_color(20, 100, 30) 
    pdf.cell(0, 30, urllib.parse.unquote(name), align="C", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "", 16)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 10, "has successfully completed the Online TOEFL iBT Speaking Simulation", align="C", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_y(140)
    pdf.set_font("helvetica", "B", 20)
    pdf.set_text_color(15, 32, 67)
    pdf.cell(0, 15, f"Speaking Score: {score} / 30", align="C", new_x="LMARGIN", new_y="NEXT")
    
    raw_output = pdf.output()
    pdf_bytes = raw_output.encode('latin1') if isinstance(raw_output, str) else bytes(raw_output)
    
    return Response(
        content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": "inline; filename=TOEFL_Speaking_Certificate.pdf"}
    )