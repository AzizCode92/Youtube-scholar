# YouTube Scholar

YouTube Scholar is an AI-powered research assistant for YouTube videos. It allows users to analyze YouTube videos by extracting transcripts, generating summaries, chapters, Q&A, and providing deeper insights using advanced language models.

## Core Functionalities

### 1. Analyze YouTube Videos
- **Input:** Paste a YouTube video URL.
- **Process:**
  - Downloads audio and video from the provided URL.
  - Transcribes the audio using OpenAI Whisper.
  - Analyzes the transcript using a local LLM (Ollama/Llama3) to generate:
    - High-level summary
    - Chapters (table of contents with timestamps)
    - Q&A (insightful questions and answers)
  - Extracts visual snapshots from the video at regular intervals.
- **Output:**
  - Summary, transcript, chapters, visuals, and Q&A displayed in the frontend.

### 2. Deeper Analysis with Gemini
- **Feature:** Users can request a deeper analysis of any transcript section (e.g., a chapter or the full transcript).
- **Process:**
  - Sends the selected text to the Gemini API for advanced analysis.
  - Returns:
    - Key concepts
    - "Explain Like I'm 5" (ELI5) summary
    - Follow-up questions

### 3. Modern Frontend
- **React-based UI** for submitting YouTube URLs, viewing analysis results, and requesting deeper insights.
- **Status updates** for long-running tasks (downloading, transcribing, analyzing, etc.).
- **Beautiful, responsive design** with clear sections for each result type.

### 4. Backend API
- **FastAPI** server with endpoints for:
  - `/analyze`: Start video analysis (runs in background)
  - `/status/{task_id}`: Check status and get results
  - `/deeper-analysis`: Request Gemini-powered analysis for any text

## Requirements
- Python 3.8+
- Node.js (for frontend)
- ffmpeg (for media processing)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp), [OpenAI Whisper](https://github.com/openai/whisper), [Ollama](https://ollama.com/), and Gemini API access

## Getting Started
1. **Install backend dependencies:**
   - `pip install -r requirements.txt` (create as needed)
   - Install ffmpeg: `brew install ffmpeg` (macOS)
2. **Start the FastAPI backend:**
   - `python main.py`
3. **Install frontend dependencies:**
   - `cd frontend && npm install`
4. **Start the frontend:**
   - `npm start`
5. **Open** [http://localhost:3000](http://localhost:3000) in your browser.

## Notes
- The backend uses in-memory storage for task status/results.
- Ensure Ollama and Gemini API are running/configured for full functionality.
- Temporary files are stored in the `temp/` directory (ignored by git).

---

**YouTube Scholar** helps you learn from videos faster by providing AI-powered summaries, chapters, and deep insights at your fingertips.
