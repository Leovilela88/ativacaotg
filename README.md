# Ativação Terra da Gente

Webapp de quizzes interativos. Ao acertar, exibe foto, vídeo ou áudio de prêmio.
Funciona em celular/tablet (toque), computador (teclado) e Smart TV (controle remoto: setas, OK, Voltar).

## Conteúdo
Edite `public/data/quiz.json` (perguntas, opções, índice da resposta certa e prêmio) e coloque os arquivos em `public/media/`.
Tipos de prêmio: `image`, `video`, `audio`, `text`. Prefira vídeo MP4 (H.264/AAC) para compatibilidade com TVs.

## Rodar local
    npm start   # http://localhost:3000

## Deploy (Railway)
Conecte o repositório no Railway; ele detecta Node e executa `npm start`. Healthcheck em `/health`.

## Midias no Cloudflare R2
1. Crie um bucket no R2 e habilite acesso publico (dominio proprio ou `r2.dev`).
2. Envie fotos/videos/sons pelo painel da Cloudflare.
3. No Railway, defina a variavel `MEDIA_BASE_URL` com o endereco publico do bucket (sem barra no fim).
4. No `public/data/quiz.json`, use so o nome do arquivo: `"src": "video1.mp4"`.
Sem `MEDIA_BASE_URL`, o app le de `public/media/`.
