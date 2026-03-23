FROM python:3.11

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    libcairo2-dev \
    libffi-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (better Docker caching)
COPY requirements.txt .

# Install python dependencies
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy application code
COPY . .

EXPOSE 5000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000", "--reload"]