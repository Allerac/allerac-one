# Allerac-One Backend

Python backend API with FastAPI for the Allerac-One project.

## Setup

1. Create virtual environment:
```bash
python -m venv venv
```

2. Activate virtual environment:
```bash
# Windows
.\venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

5. Run the server:
```bash
uvicorn app.main:app --reload
```

The server will be running at `http://localhost:8000`

## API Documentation

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Project Structure

```
backend/
├── app/
│   ├── main.py              # Main FastAPI file
│   ├── config.py            # Settings and environment variables
│   ├── api/                 # API endpoints
│   │   ├── chat.py
│   │   ├── memory.py
│   │   └── documents.py
│   ├── services/            # Business logic
│   │   ├── llm_service.py
│   │   ├── memory_service.py
│   │   └── rag_service.py
│   └── models/              # Pydantic models
│       ├── chat.py
│       └── memory.py
├── tests/                   # Tests
├── requirements.txt
└── .env
```

## Development

```bash
# Format code
black .

# Linter
ruff check .

# Run tests
pytest
```
