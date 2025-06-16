# prompts.py
# Centralized prompt templates for LLM and Gemini API

SUMMARY_PROMPT = """
Based on the following transcript, provide a concise, high-level summary of about 3-4 sentences.
Return ONLY a JSON object with a single key "summary" containing the text.
Transcript:
---
{transcript}
"""

CHAPTERS_PROMPT = """
Based on the following transcript, identify the main topics and provide a table of contents.
Return ONLY a valid JSON object with a single key "chapters".
The value of "chapters" must be an array of objects, each with exactly two keys:
- "timestamp": a non-empty string in mm:ss format (e.g., "12:34") indicating the
- "topic": a non-empty string describing the main topic of the chapter
Find the timestamp from the beginning of the relevant section in the transcript.
Transcript:
---
{transcript}
"""

QA_PROMPT = """
Based on the following transcript, generate 3-4 insightful questions and their answers.
Return ONLY a JSON object with a single key "qa", which is an array of objects, each with "question" (string) and "answer" (string) keys.
Transcript:
---
{transcript}
"""

FLASHCARD_PROMPT = """
You are a helpful study assistant. Your task is to create flashcards from a video transcript.
Generate 5 to 10 flashcards based on the key information in the provided text.

**CRITICAL INSTRUCTIONS:**
1.  Return ONLY a single, valid JSON object.
2.  The JSON object must have a key named "flashcards".
3.  The value of "flashcards" must be an array of JSON objects.
4.  Each object in the array must have exactly two keys: "front" and "back".
5.  The values for "front" and "back" MUST be non-empty strings.

--- TRANSCRIPT ---
{transcript}
"""

GEMINI_ANALYSIS_PROMPT = """
You are a research assistant. Analyze the following text from a video transcript.
Provide a detailed analysis in a structured JSON format.

The JSON object should have the following keys:
- "key_concepts": An array of strings, where each string is a key concept or technical term mentioned.
- "eli5": A string that explains the main topic of the text in a very simple, "Explain Like I'm 5" manner.
- "follow_up_questions": An array of strings, where each string is a thought-provoking question a student might ask after learning this material.

Here is the text to analyze:
---
{text}
---

Respond with ONLY the JSON object.
"""

CUSTOM_QA_PROMPT = """
You are an expert assistant. Your knowledge is based *only* on the provided video transcript.
Given the transcript and the recent conversation history, provide a clear and concise answer to the user's current question.
If the answer cannot be found in the transcript, say "I cannot answer that based on the video content."

--- VIDEO TRANSCRIPT ---
{transcript}
---

--- CONVERSATION HISTORY ---
{history}
---

CURRENT QUESTION: {question}
"""
