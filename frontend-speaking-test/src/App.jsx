import React, { useState, useRef, useEffect } from "react";

const QUESTION_BANK = [
  "Do you agree or disagree with the following statement? It is better to study in a group than to study alone.",
  "Some people prefer to live in a small town. Others prefer to live in a big city. Which place would you prefer to live in?",
  "If you could invent something new, what product would you develop? Explain why this invention is needed.",
  "Do you agree or disagree? Children should be required to help with household chores as soon as they are old enough.",
  "Some students prefer to take online classes, while others prefer traditional face-to-face classes. Which do you prefer and why?"
];

const PREP_TIME = 15; 
const SPEAKING_TIME = 45;

function App() {
  // --- STATE AUTENTIKASI ---
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user")) || null);
  const [authMode, setAuthMode] = useState("login"); // 'login' atau 'register'
  
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  // --- STATE UJIAN ---
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [testState, setTestState] = useState("idle");
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState(null);
  const [testError, setTestError] = useState("");
  
  // --- STATE ADMIN ---
  const [historyData, setHistoryData] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => { shuffleQuestion(); }, []);
  
  // Load riwayat jika yang login adalah admin
  useEffect(() => {
    if (token && user?.role === 'admin') {
      fetchHistory();
    }
  }, [token, user]);

  const shuffleQuestion = () => {
    const randomIndex = Math.floor(Math.random() * QUESTION_BANK.length);
    setCurrentQuestion(QUESTION_BANK[randomIndex]);
  };

  // --- LOGIKA AUTENTIKASI ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError(""); setAuthSuccess("");
    
    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);
    if (authMode === "register") formData.append("full_name", fullName);

    const endpoint = authMode === "login" ? "/api/login" : "/api/register";
    
    try {
      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      
      if (data.error) {
        setAuthError(data.error);
      } else {
        if (authMode === "login") {
          // Simpan token ke state dan localStorage agar tidak hilang saat di-refresh
          setToken(data.token);
          setUser(data.user);
          localStorage.setItem("token", data.token);
          localStorage.setItem("user", JSON.stringify(data.user));
        } else {
          setAuthSuccess(data.message);
          setAuthMode("login"); // Arahkan ke form login setelah sukses register
        }
      }
    } catch (err) {
      setAuthError("Gagal terhubung ke server backend.");
    }
  };

  const handleLogout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setTestState("idle");
    setResult(null);
  };

  // --- LOGIKA UJIAN ---
  useEffect(() => {
    let interval = null;
    if (testState === "prep" || testState === "speaking") {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            handleTimerEnd(testState);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [testState]);

  const handleTimerEnd = (currentState) => {
    if (currentState === "prep") startRecording();
    else if (currentState === "speaking") stopAndSubmit();
  };

  const startTest = async () => {
    setTestError(""); setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setTestState("prep"); setTimeLeft(PREP_TIME);
    } catch (err) {
      setTestError("Akses mikrofon ditolak! Izinkan mikrofon di browser untuk memulai ujian.");
    }
  };

  const startRecording = () => {
    mediaRecorderRef.current = new MediaRecorder(streamRef.current);
    audioChunksRef.current = [];
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      submitAudio(audioBlob);
    };
    mediaRecorderRef.current.start();
    setTestState("speaking"); setTimeLeft(SPEAKING_TIME);
  };

  const stopAndSubmit = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const submitAudio = async (blobToSubmit) => {
    setTestState("evaluating"); setTestError("");
    const formData = new FormData();
    formData.append("audio", blobToSubmit, "audio.webm");
    formData.append("question", currentQuestion);
    // CATATAN: Kita tidak lagi mengirim "student_name", karena backend mengambilnya otomatis dari Token!

    try {
      const response = await fetch("http://localhost:8000/api/evaluate-speech", {
        method: "POST",
        body: formData,
        headers: { "Authorization": `Bearer ${token}` } // Kirim karcis JWT di sini
      });
      const data = await response.json();
      if (data.error) setTestError(data.error);
      else setResult(data);
    } catch (err) {
      setTestError("Gagal mengirim jawaban ke server.");
    } finally {
      setTestState("done");
    }
  };

  // --- LOGIKA ADMIN ---
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch("http://localhost:8000/api/history", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.error) alert(result.error);
      else setHistoryData(result.data);
    } catch (err) {
      console.error("Gagal menarik data riwayat");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const deleteRecord = async (id) => {
    if (!window.confirm("Apakah kamu yakin ingin menghapus data ujian ini?")) return;
    try {
      await fetch(`http://localhost:8000/api/history/${id}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      fetchHistory();
    } catch (err) {
      alert("Gagal menghapus data.");
    }
  };

  const resetTest = () => {
    setTestState("idle"); setResult(null); shuffleQuestion();
  };


  // =========================================================================
  // RENDER TAMPILAN APLIKASI
  // =========================================================================

  // JIKA BELUM LOGIN: TAMPILKAN HALAMAN AUTHENTICATION
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-blue-900">
            TOEFL iBT® Platform
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {authMode === "login" ? "Sign in to take your exam or manage students" : "Create a new student account"}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-200">
            {authSuccess && <div className="mb-4 bg-green-50 text-green-700 p-3 rounded text-sm">{authSuccess}</div>}
            {authError && <div className="mb-4 bg-red-50 text-red-700 p-3 rounded text-sm">{authError}</div>}
            
            <form onSubmit={handleAuth} className="space-y-6">
              {authMode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name (For Certificate)</label>
                  <input type="text" required value={fullName} onChange={(e)=>setFullName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Email Address</label>
                <input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                {authMode === "login" ? "Sign In" : "Register Account"}
              </button>
            </form>
            
            <div className="mt-6 text-center">
              <button onClick={() => {setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); setAuthSuccess("");}} className="text-sm text-blue-600 hover:text-blue-500">
                {authMode === "login" ? "Don't have an account? Register here." : "Already have an account? Sign in."}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // JIKA SUDAH LOGIN: TAMPILKAN APLIKASI UTAMA (UJIAN / ADMIN)
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
        
        {/* HEADER */}
        <div className="bg-blue-900 px-6 py-6 flex justify-between items-center relative">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">TOEFL iBT® Portal</h1>
            <p className="text-sm text-blue-200 mt-1">
              Welcome, <span className="font-bold">{user?.full_name}</span> ({user?.role})
            </p>
          </div>
          <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-4 rounded shadow transition">
            Logout
          </button>
        </div>

        <div className="p-8">
          {user?.role === 'admin' ? (
            /* --- TAMPILAN ADMIN DASHBOARD --- */
            <div className="animate-fade-in-up">
              <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h2 className="text-2xl font-bold text-gray-800">Admin Dashboard</h2>
                <button onClick={fetchHistory} className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded hover:bg-blue-200">Refresh Data 🔄</button>
              </div>
              
              {isLoadingHistory ? (
                <p className="text-center text-gray-500 py-10">Loading database...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                    <thead className="bg-gray-100 text-gray-600">
                      <tr>
                        <th className="py-3 px-4 text-left font-semibold text-sm">Student</th>
                        <th className="py-3 px-4 text-center font-semibold text-sm">Score</th>
                        <th className="py-3 px-4 text-left font-semibold text-sm">Date</th>
                        <th className="py-3 px-4 text-center font-semibold text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      {historyData.length > 0 ? (
                        historyData.map((row) => (
                          <tr key={row.id} className="border-t border-gray-200 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm font-bold">{row.student_name}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${row.score >= 26 ? 'bg-green-100 text-green-800' : row.score >= 18 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                {row.score} / 30
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-500">{row.exam_date}</td>
                            <td className="py-3 px-4 text-center space-x-2">
                              <button onClick={() => setSelectedDetail(row)} className="text-blue-600 hover:text-blue-800 text-sm font-semibold bg-blue-50 px-3 py-1 rounded">Detail</button>
                              <button onClick={() => deleteRecord(row.id)} className="text-red-600 hover:text-red-800 text-sm font-semibold bg-red-50 px-3 py-1 rounded">Delete</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="4" className="py-8 text-center text-gray-500">No exam records found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* --- TAMPILAN PESERTA UJIAN --- */
            <div className="animate-fade-in-up">
              <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg mb-8 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 font-bold uppercase text-sm">Speaking Prompt</span>
                  {testState === "idle" && <button onClick={shuffleQuestion} className="text-xs bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300">Change Question 🔄</button>}
                </div>
                <p className="text-xl text-gray-900 font-medium">{currentQuestion}</p>
              </div>
              
              <div className="flex flex-col items-center space-y-6">
                {testState === "idle" && <button onClick={startTest} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-10 rounded-full shadow-md transition transform hover:scale-105">▶️ Start Exam</button>}
                {testState === "prep" && (
                  <div className="w-full text-center bg-yellow-100 border-2 border-yellow-400 p-6 rounded-xl animate-pulse">
                    <p className="text-yellow-800 font-bold text-lg mb-2">🤔 PREPARATION TIME</p>
                    <p className="text-6xl font-black text-yellow-600">{timeLeft}s</p>
                  </div>
                )}
                {testState === "speaking" && (
                  <div className="w-full text-center bg-red-50 border-2 border-red-500 p-6 rounded-xl relative">
                    <p className="text-red-800 font-bold text-lg mb-2">🎙️ SPEAK NOW</p>
                    <p className="text-6xl font-black text-red-600">{timeLeft}s</p>
                    <button onClick={stopAndSubmit} className="mt-4 bg-gray-800 hover:bg-black text-white text-sm py-2 px-6 rounded-full shadow">Finish Early ⏹️</button>
                  </div>
                )}
                {testState === "evaluating" && (
                  <div className="w-full text-center p-8 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xl font-bold text-blue-800">AI is evaluating your response... ⏳</p>
                  </div>
                )}
              </div>

              {testError && <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4"><p className="text-red-700">{testError}</p></div>}
              {testState === "done" && result && !testError && (
                <div className="mt-10 bg-green-50 rounded-xl p-6 border border-green-200">
                  <h2 className="text-2xl font-bold text-green-900 border-b border-green-200 pb-3 mb-4">Score Report Ready</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-white p-4 rounded-lg text-center shadow-sm">
                      <p className="text-sm text-gray-500 font-semibold">TOEFL Score</p>
                      <p className="text-5xl font-extrabold text-blue-700 mt-2">{result.score} <span className="text-xl text-gray-400">/ 30</span></p>
                    </div>
                    <div className="bg-white p-4 rounded-lg flex flex-col justify-center shadow-sm">
                      <p className="text-sm text-gray-500 font-semibold mb-1">Feedback</p>
                      <p className="text-gray-700 italic">"{result.feedback}"</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    {result.certificateUrl && <a href={result.certificateUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow">🎓 Download Certificate</a>}
                    <button onClick={resetTest} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg transition">🔄 Try Another</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- MODAL DETAIL TRANKSRIP UNTUK ADMIN --- */}
      {selectedDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="text-xl font-bold text-gray-800">Exam Details: {selectedDetail.student_name}</h3>
              <button onClick={() => setSelectedDetail(null)} className="text-gray-500 hover:text-red-500 text-2xl font-bold">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-500 uppercase">AI Feedback</p>
                <p className="text-gray-800 bg-blue-50 p-3 rounded mt-1 border border-blue-100">{selectedDetail.feedback}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500 uppercase">Transcribed Audio</p>
                <div className="text-gray-700 bg-gray-50 p-4 rounded mt-1 border border-gray-200 max-h-48 overflow-y-auto italic">
                  "{selectedDetail.transcript}"
                </div>
              </div>
            </div>
            <div className="mt-6 text-right">
              <button onClick={() => setSelectedDetail(null)} className="bg-gray-800 hover:bg-black text-white font-bold py-2 px-6 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;