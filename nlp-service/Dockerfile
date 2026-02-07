FROM python:3.10

WORKDIR /app

COPY . .

RUN pip install flask spacy
RUN python -m spacy download en_core_web_sm

EXPOSE 6000

CMD ["python", "app.py"]
