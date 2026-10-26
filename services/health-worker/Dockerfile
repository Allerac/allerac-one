FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --no-cache-dir --upgrade 'pip>=26.2.2' \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && update-ca-certificates

COPY . .

EXPOSE 8001

CMD ["python", "app.py"]
