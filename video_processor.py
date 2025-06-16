from utils import (
    download_media,
    transcribe_audio,
    extract_visuals,
    Flashcard,
    FlashcardList,
    SummaryModel,
    Chapter,
    ChaptersModel,
    QAItem,
    QAListModel
)
from prompts import (
    SUMMARY_PROMPT,
    CHAPTERS_PROMPT,
    QA_PROMPT,
    FLASHCARD_PROMPT,
    GEMINI_ANALYSIS_PROMPT,
    CUSTOM_QA_PROMPT
)
import requests
import json
from fastapi import HTTPException
from typing import List, Dict
from pydantic import ValidationError


def get_llm_analysis(full_text: str):
    """
    Queries the local Ollama server to generate a summary, chapters, and Q&A.
    Validates the output using Pydantic models.
    """
    OLLAMA_API_URL = "http://localhost:11434/api/generate"
    MODEL_NAME = "llama3"

    def query_ollama(prompt):
        try:
            response = requests.post(OLLAMA_API_URL, json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                 "format": "json"
            }, timeout=300)
            response.raise_for_status()
            return json.loads(response.json()['response'])
        except requests.exceptions.RequestException as e:
            print(f"Error querying Ollama: {e}")
            return None
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON from Ollama: {e}")
            print(f"Received: {response.text}")
            return None

    # --- Prompt for Summary ---
    summary_prompt = SUMMARY_PROMPT.format(transcript=full_text[:4000])
    summary_json = query_ollama(summary_prompt)
    try:
        summary_validated = SummaryModel.model_validate(summary_json)
        summary = summary_validated.summary
    except Exception as e:
        print(f"Summary validation error: {e}")
        summary = summary_json.get('summary', 'Could not generate summary.') if summary_json else 'Failed to connect to Ollama.'

    # --- Prompt for Chapters ---
    chapters_prompt = CHAPTERS_PROMPT.format(transcript=full_text)
    chapters_json = query_ollama(chapters_prompt)
    try:
        chapters_validated = ChaptersModel.model_validate(chapters_json)
        chapters = [c.model_dump() for c in chapters_validated.chapters]
    except Exception as e:
        print(f"Chapters validation error: {e}")
        chapters = chapters_json.get('chapters', []) if chapters_json else []

    # --- Prompt for Q&A ---
    qa_prompt = QA_PROMPT.format(transcript=full_text[:4000])
    qa_json = query_ollama(qa_prompt)
    try:
        qa_validated = QAListModel.model_validate(qa_json)
        qa = [q.model_dump() for q in qa_validated.qa]
    except Exception as e:
        print(f"QA validation error: {e}")
        qa = qa_json.get('qa', []) if qa_json else []

    return summary, chapters, qa


def get_gemini_deeper_analysis(text_to_analyze: str):
    """
    Queries the Gemini API for a deeper analysis of the provided text.
    """
    API_KEY = "" 
    API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={API_KEY}"

    prompt = GEMINI_ANALYSIS_PROMPT.format(text=text_to_analyze)

    payload = {
        "contents": [{
            "role": "user",
            "parts": [{"text": prompt}]
        }]
    }

    try:
        response = requests.post(API_URL, json=payload, headers={'Content-Type': 'application/json'}, timeout=120)
        response.raise_for_status()
        
        result_json = response.json()
        
        if 'candidates' in result_json and result_json['candidates']:
            content = result_json['candidates'][0]['content']['parts'][0]['text']
            cleaned_content = content.strip().replace("```json", "").replace("```", "")
            return json.loads(cleaned_content)
        else:
            raise HTTPException(status_code=500, detail="Invalid response from Gemini API")

    except requests.exceptions.RequestException as e:
        print(f"Error calling Gemini API: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Gemini API: {e}")
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from Gemini: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse Gemini API response.")


def get_llm_answer(full_text: str, user_question: str, history: List[Dict[str, str]] = []):
    """
    Queries the local Ollama server to answer a custom user question,
    considering the conversation history for context.
    """
    OLLAMA_API_URL = "http://localhost:11434/api/generate"
    MODEL_NAME = "llama3"

    history_prompt = ""
    for message in history:
        if message.get('sender') == 'user':
            history_prompt += f"The user previously asked: {message.get('text')}\n"
        elif message.get('sender') == 'ai':
            history_prompt += f"You previously answered: {message.get('text')}\n"

    prompt = CUSTOM_QA_PROMPT.format(
        transcript=full_text[:8000],
        history=history_prompt if history_prompt else "No previous conversation.",
        question=user_question
    )
    try:
        response = requests.post(OLLAMA_API_URL, json={
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False
        }, timeout=120)
        response.raise_for_status()
        return response.json().get('response', 'No answer was generated.')
    except Exception as e:
        print(f"Error in get_llm_answer: {e}")
        return "Failed to get an answer from the language model."


# --- 2. REWRITTEN FUNCTION USING PYDANTIC FOR ENFORCEMENT ---
def generate_flashcards(full_text: str):
    """
    Uses an LLM to generate flashcards and validates the output using Pydantic.
    """
    OLLAMA_API_URL = "http://localhost:11434/api/generate"
    MODEL_NAME = "llama3"

    prompt = FLASHCARD_PROMPT.format(transcript=full_text[:8000])

    try:
        response = requests.post(OLLAMA_API_URL, json={
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }, timeout=180)
        response.raise_for_status()
        
        # Parse the entire JSON string from the response
        llm_output = json.loads(response.json()['response'])

        # Use Pydantic to validate and parse the data
        # This will raise a ValidationError if the structure is wrong
        validated_data = FlashcardList.model_validate(llm_output)
        
        # Pydantic models can be easily converted back to dicts if needed
        return validated_data.dict()["flashcards"]

    except ValidationError as e:
        print(f"Pydantic Validation Error: LLM output did not match the expected format. \n{e}")
        return None # Or return [] to indicate no valid cards were found
    except requests.exceptions.RequestException as e:
        print(f"Error querying Ollama for flashcards: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from Ollama's response: {e}")
        return None