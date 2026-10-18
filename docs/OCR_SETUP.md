# Leitura local de comprovantes

O OCR usa Tesseract.js no navegador; PDF.js converte paginas do PDF em canvas. O processamento da imagem e as expressoes regulares rodam no dispositivo. Nenhuma API de IA recebe o texto ou arquivo. Firebase e usado somente para gravar a transacao confirmada e, opcionalmente, guardar o comprovante no Storage.

## Bibliotecas

O HTML carrega Tesseract.js 6.0.1 via jsDelivr e PDF.js 3.11.174 via cdnjs. No primeiro uso, Tesseract baixa o modelo de idioma `por` do servidor estatico `tessdata.projectnaptha.com`; sao arquivos publicos do modelo, nao uma chamada de inferencia. A inferencia do OCR permanece no navegador. O navegador precisa de acesso a esses arquivos na primeira leitura; o cache do Tesseract reduz downloads futuros.

Se preferir nao depender desses CDNs, baixe e hospede no GitHub Pages os arquivos de distribuicao do Tesseract.js, do Tesseract.js-core, o worker do PDF.js e o arquivo `por.traineddata.gz`, e ajuste os caminhos do script, `workerSrc` e `langPath` em `index.html`.

## Uso

1. Entre no app e toque no botao flutuante `+`; o worker com idioma portugues comeca a aquecer enquanto o seletor de foto/PDF abre.
2. Imagens sao reduzidas a 1800 px e processadas com filtros acelerados do Canvas; PDFs de ate cinco paginas sao renderizados localmente a 1800 px.
3. A barra mostra o progresso restante do worker e do reconhecimento. O OCR preenche somente valor e data. O usuario escolhe Receita/Despesa e categoria; a descricao e opcional.
4. Revise os valores. Se a leitura falhar, o modo manual continua disponivel.
5. `Confirmar e salvar` sempre envia o comprovante otimizado (ou PDF original) ao Storage em `receipts/{uid}/...` e grava a transacao em `transactions` com `receiptPath` no Firestore. Os arquivos sao associados ao usuario autenticado.

## Limites e privacidade

- O suporte nativo do Tesseract.js e para imagens; para PDF, PDF.js rasteriza as paginas. PDFs com mais de cinco paginas precisam ser divididos ou fotografados.
- O worker e o modelo em portugues sao baixados no primeiro uso. O toque no `+` inicia esse carregamento antes da selecao; o worker pronto e reutilizado nos comprovantes seguintes.
- Regex e OCR sao heuristicas, nao validacao bancaria. Valores/data ambiguos recebem baixa confianca; o usuario sempre confirma e escolhe o tipo/categoria.
- Nenhum arquivo ou texto OCR sai do navegador para analise. O arquivo otimizado e enviado ao Firebase Storage junto com a gravacao da transacao confirmada.
- Publique `storage.rules` no Firebase Storage para limitar leitura e escrita ao usuario autenticado, limitar arquivos a 6 MB e aceitar somente imagens/PDF. Mantenha tambem as regras existentes do Firestore restritas ao `userId` do usuario autenticado.
- **Configuração do CORS no bucket do Storage**:
  1. Acesse o [Google Cloud Shell](https://shell.cloud.google.com/) no navegador.
  2. Defina o projeto:
     `gcloud config set project financial-control-467b0`
  3. Aplique o `cors.json` ao bucket:
     `gcloud storage buckets update gs://financial-control-467b0.firebasestorage.app --cors-file=cors.json`
     *(ou `gs://financial-control-467b0.appspot.com` se o bucket tiver esse nome no seu Firebase Console)*.
- **Fallback Automático**: Se o Firebase Storage estiver com CORS bloqueado ou não inicializado, o app salva automaticamente o comprovante (imagem otimizada) em Base64 diretamente no documento do Firestore (`receiptBase64`). O lançamento nunca fica travado ou perdido.
- **Visualização**: Transações com comprovante exibem um botão de anexo na lista de lançamentos para abrir o comprovante em nova aba.
