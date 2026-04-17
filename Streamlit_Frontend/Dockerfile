# Frontend/Dockerfile

FROM python:3.10.8-slim

RUN mkdir -p app/frontend

COPY Streamlit_Frontend app/frontend

WORKDIR /app/frontend

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

EXPOSE 8501

CMD ["python", "-m", "streamlit", "run", "Hello.py", "--server.port=8501", "--server.address=0.0.0.0"]
