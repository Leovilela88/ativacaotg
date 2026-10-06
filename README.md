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
