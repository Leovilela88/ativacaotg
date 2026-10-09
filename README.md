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

## Ativações (um link, um conteúdo e um ranking para cada)
| Endereço | O que é |
|---|---|
| `/` | **Menu principal** (pede a senha do admin): abre cada ativação e copia os links |
| `/peixes` | Ativação Peixes São Carlos |
| `/aves` | Ativação Aves São Carlos |
| `/projeta` | Ativação Projeta 2027 |
| `/admin` | Painel: abas por ativação (Perguntas e Ranking) e Mídias |

Os links das TVs e telas são os de cada ativação. Dentro delas, os botões de voltar levam só ao início da própria
ativação. O menu principal fica atrás de um **toque longo (~2 s) no canto inferior direito**, sem rótulo visível, e
ainda assim pede a senha.

O conteúdo fica no R2 (`_data/quiz.json`) no formato `{ activations: [{ id, title, quizzes: [...] }] }`.
O formato antigo (lista única de quizzes) é convertido automaticamente. Cada quiz tem id único, e o ranking
(`_data/ranking.json`) é guardado por quiz, então nunca se mistura entre ativações.

## Admin (/admin)
Painel protegido por senha para editar quizzes, perguntas e prêmios e para subir fotos, vídeos e sons.
O conteúdo editado fica no bucket R2 (`_data/quiz.json`), então sobrevive aos deploys.
Sem as variáveis do R2, o site público usa `public/data/quiz.json` como padrão.

Variáveis no Railway (veja `.env.example`): `ADMIN_PASSWORD`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_BASE_URL`.
