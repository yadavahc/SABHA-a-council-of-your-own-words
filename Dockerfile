FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TUNNEL=none \
    PORT=7860

# Hugging Face Spaces runs containers as uid 1000
RUN useradd -m -u 1000 user
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --chown=user . .
USER user

# Bake the embedding model into the image so cold starts don't download it
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='data/models')"

EXPOSE 7860
CMD ["python", "run.py"]
