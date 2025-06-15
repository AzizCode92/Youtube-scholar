// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import YouTube from 'react-youtube';
import './App.css';

const API_URL = 'http://localhost:8000';

// --- New Component for Gemini Results ---
function DeeperAnalysisResult({ analysis }) {
  if (!analysis) return null;

  return (
    <div className="deeper-analysis-result">
      <h4>✨ Deeper Analysis from Gemini</h4>
      
      <div className="analysis-section">
        <h5>Key Concepts</h5>
        <ul>
          {analysis.key_concepts && analysis.key_concepts.map((concept, i) => <li key={i}>{concept}</li>)}
        </ul>
      </div>

      <div className="analysis-section">
        <h5>Explain Like I'm 5 (ELI5)</h5>
        <p>{analysis.eli5}</p>
      </div>

      <div className="analysis-section">
        <h5>Follow-up Questions</h5>
        <ul>
          {analysis.follow_up_questions && analysis.follow_up_questions.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
      </div>
    </div>
  );
}


function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [task, setTask] = useState(null);
  const [taskId, setTaskId] = useState(null); // Added state for taskId
  const [error, setError] = useState('');
  
  // --- New State for Gemini Feature ---
  const [deeperAnalysis, setDeeperAnalysis] = useState({}); // Store analysis by chapter/full
  const [isDeeperLoading, setIsDeeperLoading] = useState(null); // Tracks which item is loading

  const [userQuestion, setUserQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState(null);
  const [isAsking, setIsAsking] = useState(false);

  const intervalRef = useRef(null);
  const playerRef = useRef(null);
  const [videoId, setVideoId] = useState(null);

  // Extract YouTube video ID from URL
  const extractVideoId = (youtubeUrl) => {
    const regExp = /^.*(?:http:\/\/googleusercontent.com\/youtube.com\/0\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#&?]*).*/;
    const match = youtubeUrl.match(regExp);
    return (match && match[1].length === 11) ? match[1] : null;
  };

  const pollStatus = (currentTaskId) => {
    intervalRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/status/${currentTaskId}`);
        setTask(data);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(intervalRef.current);
          setIsLoading(false);
        }
      } catch (err) {
        setError('Failed to get status.');
        setIsLoading(false);
        clearInterval(intervalRef.current);
      }
    }, 2000); 
  };
  
  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  // When a new task is set, extract video ID
  useEffect(() => {
    if (url) {
        setVideoId(extractVideoId(url));
    }
  }, [url]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setTask(null);
    setTaskId(null); // Reset task ID
    setDeeperAnalysis({}); // Clear old results
    setAskAnswer(null); // Clear previous answer
    setUserQuestion(""); // Clear previous question
    setIsLoading(true);

    try {
      const { data } = await axios.post(`${API_URL}/analyze`, null, { // Corrected: send URL as a param
        params: { youtube_url: url }
      });
      if (data.task_id) {
        setTask({ status: 'accepted', task_id: data.task_id });
        setTaskId(data.task_id); // Set the task ID here
        pollStatus(data.task_id);
      }
    } catch (err) {
      setError('Failed to start analysis. Is the backend running?');
      setIsLoading(false);
    }
  };

  // --- New Function to Handle Gemini Analysis Request ---
  const handleDeeperAnalysis = async (text, id) => {
    setIsDeeperLoading(id);
    try {
      const response = await axios.post(`${API_URL}/deeper-analysis`, { text });
      setDeeperAnalysis(prev => ({ ...prev, [id]: response.data }));
    } catch (err) {
      console.error("Deeper analysis failed", err);
      const errorMsg = err.response?.data?.detail || "Failed to get deeper analysis.";
      setDeeperAnalysis(prev => ({ ...prev, [id]: { error: errorMsg } }));
    } finally {
      setIsDeeperLoading(null);
    }
  };
  
  const getChapterText = (chapterTimestamp) => {
    if (!task || !task.result || !task.result.transcript) return "";
    const { transcript, chapters } = task.result;
    
    const chapterIndex = chapters.findIndex(c => c.timestamp === chapterTimestamp);
    if (chapterIndex === -1) return "";
    
    const startIndex = transcript.findIndex(t => t.timestamp === chapterTimestamp);
    if (startIndex === -1) return "";
    
    const isLastChapter = chapterIndex === chapters.length - 1;
    const endIndex = isLastChapter 
      ? transcript.length 
      : transcript.findIndex(t => t.timestamp === chapters[chapterIndex + 1].timestamp);

    const relevantSegments = transcript.slice(startIndex, endIndex === -1 ? transcript.length : endIndex);
    return relevantSegments.map(s => s.text).join(' ');
  }

  // Seek video to seconds
  const handleSeek = (timestamp) => {
    if (!playerRef.current || typeof playerRef.current.seekTo !== 'function') return;
    // timestamp is in mm:ss
    const [min, sec] = timestamp.split(":").map(Number);
    const seconds = min * 60 + sec;
    playerRef.current.seekTo(seconds, true);
  };

  // Handle Ask Me Anything
  const handleAsk = async (e) => {
    e.preventDefault();
    if (!userQuestion.trim() || !taskId) return;
    setIsAsking(true);
    setAskAnswer(null);
    try {
      const { data } = await axios.post(`${API_URL}/ask`, { // Corrected: send JSON payload
        task_id: taskId,
        question: userQuestion.trim(),
      });
      setAskAnswer(data.answer);
    } catch (err) {
        console.error("Error asking question:", err); // Log the error
      setAskAnswer("Failed to get answer. Please try again.");
    } finally {
      setIsAsking(false);
    }
  };

  // Render transcript with clickable timestamps
  const renderTranscript = (transcript) => (
    <div className="transcript">
      {transcript.map((t, idx) => (
        <p key={t.timestamp + idx}>
          <span
            className="transcript-timestamp"
            style={{ color: '#1a73e8', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => handleSeek(t.timestamp)}
          >
            {t.timestamp}
          </span>
          {" - "}
          <span
            className="transcript-text"
            onClick={() => handleSeek(t.timestamp)}
            style={{ cursor: 'pointer' }}
          >
            {t.text}
          </span>
        </p>
      ))}
    </div>
  );

  const renderResult = () => {
    if (!task || !task.result) return null;
    const { result } = task;
    return (
      <div className="results-container">
        {videoId && (
          <div style={{ marginBottom: 24 }}>
            <YouTube
              videoId={videoId}
              opts={{ width: '100%', height: '390', playerVars: { rel: 0 } }}
              onReady={e => { playerRef.current = e.target; }}
            />
          </div>
        )}
        <h2>Analysis Result</h2>

        <div className="result-section">
          <h3>Summary <button 
              className="gemini-button"
              disabled={isDeeperLoading === 'full_text'}
              onClick={() => handleDeeperAnalysis(result.full_text, 'full_text')}>
                {isDeeperLoading === 'full_text' ? 'Analyzing...' : '✨ Deeper Analysis'}
              </button>
          </h3>
          <p>{result.summary}</p>
          {deeperAnalysis['full_text'] && <DeeperAnalysisResult analysis={deeperAnalysis['full_text']} />}
        </div>

        <div className="result-section">
          <h3>Chapters</h3>
          {result.chapters.map(c => {
            const chapterId = `chapter_${c.timestamp}`;
            return (
              <div key={c.timestamp} className="chapter-item">
                <p>
                  <strong>[{c.timestamp}]</strong> {c.topic}
                  <button 
                    className="gemini-button-small"
                    disabled={isDeeperLoading === chapterId}
                    onClick={() => handleDeeperAnalysis(getChapterText(c.timestamp), chapterId)}>
                     {isDeeperLoading === chapterId ? '...' : '✨'}
                  </button>
                </p>
                {deeperAnalysis[chapterId] && <DeeperAnalysisResult analysis={deeperAnalysis[chapterId]} />}
              </div>
            );
          })}
        </div>

        <div className="result-section">
          <h3>Q&A</h3>
          {result.qa.map((item, i) => (
            <div key={i} className="qa-item">
              <p><strong>Q:</strong> {item.question}</p>
              <p><strong>A:</strong> {item.answer}</p>
            </div>
          ))}
        </div>
        
        <div className="result-section">
          <h3>Transcript</h3>
          {renderTranscript(result.transcript)}
        </div>

        <div className="result-section">
          <h3>Ask Me Anything <span role="img" aria-label="chat">💬</span></h3>
          <form onSubmit={handleAsk} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={userQuestion}
              onChange={e => setUserQuestion(e.target.value)}
              placeholder="Ask a question about this video..."
              style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
              disabled={isAsking}
            />
            <button type="submit" className="gemini-button" disabled={isAsking || !userQuestion.trim()}>
              {isAsking ? "Asking..." : "Ask"}
            </button>
          </form>
          {askAnswer && (
            <div style={{ background: '#f9f9f9', borderRadius: 6, padding: 12, marginTop: 4, border: '1px solid #eee' }}>
              <strong>Answer:</strong> {askAnswer}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>YouTube Scholar</h1>
        <p>Your AI Research Assistant for Videos</p>
      </header>
      <main>
        <form onSubmit={handleSubmit} className="url-form">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter YouTube URL"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !url.trim()}>
            {isLoading ? 'Analyzing...' : 'Analyze'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {isLoading && task && (
          <div className="status">
            <p><strong>Status:</strong> {task.status}...</p>
            {task.stage && <p><strong>Stage:</strong> {task.stage}</p>}
          </div>
        )}
        {task && task.status === 'completed' && renderResult()}
        {task && task.status === 'failed' && <p className="error">Analysis Failed: {task.result}</p>}
      </main>
    </div>
  );
}

export default App;