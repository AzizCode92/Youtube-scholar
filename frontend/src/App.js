// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import YouTube from 'react-youtube';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './App.css'; 

const API_URL = 'http://localhost:8000';

// --- Component for Deeper Analysis Results ---
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


// --- NEW: Component to Render Chat Messages with Code Highlighting ---
function ChatMessage({ text }) {
    // Regex to find code blocks wrapped in ```
    const parts = text.split(/(```(?:\w+\n)?[\s\S]*?```)/);
  
    return (
      <p>
        {parts.map((part, index) => {
          const codeBlockMatch = part.match(/```(?:(\w+)\n)?([\s\S]*?)```/);
          if (codeBlockMatch) {
            const language = codeBlockMatch[1] || 'javascript'; // Default to JS if no language specified
            const code = codeBlockMatch[2];
            return (
              <div key={index} className="code-block-wrapper">
                <SyntaxHighlighter language={language} style={oneDark} customStyle={{ margin: 0, borderRadius: '8px' }}>
                  {code}
                </SyntaxHighlighter>
              </div>
            );
          }
          return part;
        })}
      </p>
    );
}

// --- Chat Popup Component ---
function ChatPopup({ isOpen, onClose, onAsk, conversation, isAsking, greeting }) {
    const [localQuestion, setLocalQuestion] = useState("");
    const messagesEndRef = useRef(null);
  
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation, isAsking]);
  
    if (!isOpen) {
      return null;
    }
  
    const handleSubmit = (e) => {
      e.preventDefault();
      if (!localQuestion.trim()) return;
      onAsk(localQuestion);
      setLocalQuestion("");
    };
  
    return (
      <div className="chat-popup-container">
        <div className="chat-header">
          <span>AI Assistant</span>
          <button className="chat-close" onClick={onClose} aria-label="Close chat">×</button>
        </div>
        <div className="chat-body">
            <div className="message-list">
                <div className="message ai">
                    <p>{greeting}</p>
                </div>
                {conversation.map((msg, index) => (
                    <div key={index} className={`message ${msg.sender}`}>
                        {/* Use the new ChatMessage component here */}
                        <ChatMessage text={msg.text} />
                    </div>
                ))}
                {isAsking && (
                    <div className="message ai">
                        <p><i>Typing...</i></p>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSubmit} className="chat-form">
                <input
                    type="text"
                    value={localQuestion}
                    onChange={(e) => setLocalQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    disabled={isAsking}
                    className="chat-input"
                    autoFocus
                />
                <button type="submit" className="chat-send" disabled={isAsking || !localQuestion.trim()}>
                    Send
                </button>
            </form>
        </div>
      </div>
    );
}


function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [task, setTask] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [error, setError] = useState('');
  
  const [deeperAnalysis, setDeeperAnalysis] = useState({});
  const [isDeeperLoading, setIsDeeperLoading] = useState(null);

  // --- Consolidated State for Chat ---
  const [conversation, setConversation] = useState([]);
  const [isAsking, setIsAsking] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [flashcards, setFlashcards] = useState([]);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [flippedCardIds, setFlippedCardIds] = useState(new Set());

  const intervalRef = useRef(null);
  const playerRef = useRef(null);
  const [videoId, setVideoId] = useState(null);

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

  useEffect(() => {
    if (url) {
      setVideoId(extractVideoId(url));
    }
  }, [url]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setTask(null);
    setTaskId(null);
    setDeeperAnalysis({});
    setConversation([]);
    setFlashcards([]);
    setFlippedCardIds(new Set());
    setIsChatOpen(false); // Close chat on new analysis
    setIsLoading(true);

    try {
      const { data } = await axios.post(`${API_URL}/analyze?youtube_url=${encodeURIComponent(url)}`);
      if (data.task_id) {
        setTask({ status: 'accepted', task_id: data.task_id });
        setTaskId(data.task_id);
        pollStatus(data.task_id);
      }
    } catch (err) {
      setError('Failed to start analysis. Is the backend running?');
      setIsLoading(false);
    }
  };

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

  const handleSeek = (timestamp) => {
    if (!playerRef.current || typeof playerRef.current.seekTo !== 'function') return;
    const [min, sec] = timestamp.split(":").map(Number);
    const seconds = min * 60 + sec;
    playerRef.current.seekTo(seconds, true);
  };

  const handleAsk = async (question) => {
    if (!question.trim() || !taskId) return;

    const newConversation = [...conversation, { sender: 'user', text: question }];
    setConversation(newConversation);
    setIsAsking(true);

    try {
      const { data } = await axios.post(`${API_URL}/ask`, {
        task_id: taskId,
        question: question.trim(),
        history: newConversation.slice(0, -1)
      });
      setConversation([...newConversation, { sender: 'ai', text: data.answer }]);
    } catch (err) {
      setConversation([...newConversation, { sender: 'ai', text: "Sorry, I ran into an error. Please try again." }]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!taskId) return;
    setIsGeneratingFlashcards(true);
    setFlashcards([]);
    try {
      const { data } = await axios.post(`${API_URL}/generate-flashcards`, { task_id: taskId });
      setFlashcards(data.flashcards || []);
    } catch (err) {
      console.error("Failed to generate flashcards", err);
      setError("Could not generate flashcards. Please try again.");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const handleFlipCard = (index) => {
    const newFlippedCardIds = new Set(flippedCardIds);
    if (newFlippedCardIds.has(index)) {
      newFlippedCardIds.delete(index);
    } else {
      newFlippedCardIds.add(index);
    }
    setFlippedCardIds(newFlippedCardIds);
  };

  const getGreetingMessage = () => {
    if (task && task.result) {
        let topicSource = task.result.summary || "";
        if (task.result.chapters && task.result.chapters.length > 0) {
            topicSource = task.result.chapters[0].topic;
        }
        topicSource = topicSource.toLowerCase();

        if (topicSource.includes('leetcode') || topicSource.includes('problem')) {
            return "Hey! Wanna deep dive into this problem-solving video?";
        } else if (topicSource.includes('python') || topicSource.includes('react') || topicSource.includes('javascript')) {
            return `Hi there! Have questions about ${topicSource.split(' ')[0]}? Ask away!`;
        }
        return "Hi! Have any questions about the video? Ask me anything.";
    }
    return "Hello! How can I help you with this video?";
  };

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
            <h3>Study Flashcards <span role="img" aria-label="cards">📇</span></h3>
            {flashcards.length === 0 ? (
                 <button className="gemini-button" onClick={handleGenerateFlashcards} disabled={isGeneratingFlashcards}>
                    {isGeneratingFlashcards ? 'Generating...' : 'Generate Flashcards from Video'}
                 </button>
            ) : (
                <div className="flashcard-container">
                    {flashcards.map((card, index) => (
                        <div key={index} className="flashcard-scene" onClick={() => handleFlipCard(index)}>
                            <div className={`flashcard ${flippedCardIds.has(index) ? 'is-flipped' : ''}`}>
                                <div className="flashcard-face flashcard-front">
                                    <p>{card.front}</p>
                                </div>
                                <div className="flashcard-face flashcard-back">
                                    <p>{card.back}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

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
          <h3>Transcript</h3>
          <div className="transcript">
            {result.transcript.map((t, idx) => (
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

      {/* --- FLOATING CHAT BUTTON & POPUP RENDER --- */}
      {task && task.status === 'completed' && !isChatOpen && (
         <button className="chat-fab" onClick={() => setIsChatOpen(true)} aria-label="Open chat">💬</button>
      )}
      
      <ChatPopup 
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onAsk={handleAsk}
        conversation={conversation}
        isAsking={isAsking}
        greeting={getGreetingMessage()}
      />
    </div>
  );
}

export default App;
