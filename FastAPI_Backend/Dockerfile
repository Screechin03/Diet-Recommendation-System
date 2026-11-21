FROM python:3.10.8-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
	&& pip install --no-cache-dir -r /app/requirements.txt

# The recipe dataset lives in Git LFS, which hosts like Render don't reliably fetch, and the
# build context (this folder) doesn't include ../Data anyway. Download it here and convert it into
# a SQLite store (recipe_store.py), so the running API needs ~300 MB of RAM instead of ~800 MB and
# fits a free 512 MB instance. Only the files the conversion needs are copied first, so ordinary
# code changes don't re-download the dataset.
# Pass --build-arg DATASET_URL= to skip (then mount Data/ and set DATASET_PATH yourself).
ARG DATASET_URL=https://media.githubusercontent.com/media/Screechin03/Diet-Recommendation-System/main/Data/dataset1.csv
COPY recipe_store.py diet_rules.py model.py /app/
RUN if [ -n "$DATASET_URL" ]; then \
	mkdir -p /opt/data \
	&& python -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" "$DATASET_URL" /tmp/recipes.csv \
	&& python -c "import sys; h = open(sys.argv[1], 'rb').read(2); sys.exit(0 if h == b'\x1f\x8b' else 'Downloaded dataset is not a gzipped CSV (got a Git LFS pointer or an error page?)')" /tmp/recipes.csv \
	&& python recipe_store.py /tmp/recipes.csv /opt/data/recipes.sqlite \
	&& rm /tmp/recipes.csv; \
	fi
ENV DATASET_PATH=/opt/data/recipes.sqlite

COPY . /app

EXPOSE 8080

# Render (and most PaaS hosts) tell the app which port to bind via $PORT; default to 8080 locally.
CMD ["sh", "-c", "exec python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
