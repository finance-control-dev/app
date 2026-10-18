# Controle Financeiro (Finance Control PWA)

Um aplicativo web progressivo (PWA) moderno, responsivo e seguro para gestão financeira pessoal com sincronização em tempo real via **Google Firebase**, leitura automatizada de comprovantes por **OCR local** e dashboards interativos.

---

## 📁 Estrutura do Projeto

O projeto foi organizado seguindo as melhores práticas de arquitetura web modular:

```text
app-main/
├── assets/                  # Recursos estáticos visuais
│   ├── icons/               # Favicon e ícones do PWA (192px, 512px)
│   │   ├── favicon.png
│   │   ├── icon.png
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── images/              # Imagens e ilustrações da aplicação
│       └── pix-qr.png
│
├── css/                     # Folhas de estilo da aplicação
│   └── styles.css           # Estilos completos, temas (Dark/Light) e responsividade
│
├── js/                      # Lógica e scripts da aplicação
│   └── app.js               # Firebase, autenticação, OCR, gráficos e regras de negócio
│
├── docs/                    # Documentação técnica e guias
│   ├── OCR_SETUP.md         # Instruções de configuração do Tesseract OCR e CORS
│   ├── SECURITY.md          # Diretrizes e boas práticas de segurança
│   └── CHANGELOG.md         # Registro de versões e melhorias
│
├── cors.json                # Configuração de CORS para o Google Cloud Storage
├── firebase.json            # Configuração de serviços do Firebase
├── storage.rules            # Regras de segurança do Firebase Storage
├── manifest.json            # Manifesto da Web App (PWA)
├── sw.js                    # Service Worker (Cache, notificações e compartilhamento)
├── index.html               # Estrutura HTML limpa e modular
└── README.md                # Visão geral do projeto e documentação
```

---

## 🚀 Tecnologias Utilizadas

* **HTML5 / CSS3 / JavaScript (ES6+):** Código nativo, sem necessidade de bundlers complexos.
* **Firebase (v10 Compat):**
  * **Authentication:** Login seguro com Google.
  * **Firestore:** Banco de dados NoSQL com sincronização em tempo real e suporte offline.
  * **Storage:** Armazenamento seguro de comprovantes na nuvem com isolamento por usuário.
* **Tesseract.js (v6.0.1):** Mecanismo de OCR executado 100% no navegador (privacidade total).
* **PDF.js (v3.11.174):** Renderização e extração de páginas de comprovantes em PDF.
* **Chart.js:** Gráficos interativos de receitas, despesas e saldo por período.
* **SheetJS (xlsx):** Exportação e importação de relatórios em planilhas Excel.

---

## ⚡ Principais Funcionalidades

1. **Gestão de Transações:** Cadastro ágil de receitas e despesas com categorização e filtros por data.
2. **Leitura Inteligente de Comprovantes:**
   * Leitura rápida via foto ou PDF.
   * Compactação adaptativa automática antes do envio (~50-80 KB) para economizar a cota do Firebase.
   * Envio assíncrono instantâneo (< 300 ms) com sincronização em segundo plano.
3. **Contas Fixas & Lembretes:** Gestão de vencimentos com notificações locais via Service Worker.
4. **Metas Financeiras:** Acompanhamento visual de objetivos financeiros.
5. **PWA Instalável:** Funciona como aplicativo nativo no celular (Android/iOS) e desktop, com suporte a compartilhamento direto de comprovantes via menu do sistema (*Web Share Target*).
6. **Tema Dark / Light & Multilíngue:** Alternância instantânea de tema e suporte a Português, Inglês e Espanhol.

---

## 🛠️ Como Executar Localmente

Como a aplicação utiliza módulos PWA e integração Firebase, recomenda-se executá-la através de um servidor HTTP local:

1. **Com VS Code (Live Server):**
   * Clique com o botão direito em `index.html` e selecione **"Open with Live Server"**.

2. **Com Node.js (npx):**
   ```bash
   npx serve .
   ```

3. **Com Python:**
   ```bash
   python -m http.server 8080
   ```
   Acesse em seu navegador: `http://localhost:8080`

---

## 🔒 Segurança e Regras

* As regras de segurança do Firebase Storage estão definidas em [`storage.rules`](file:///c:/Users/Patrick/Music/app-main/storage.rules), garantindo que apenas o usuário autenticado acesse seus próprios arquivos (`receipts/{userId}/{fileName}`).
* Consulte [`docs/SECURITY.md`](file:///c:/Users/Patrick/Music/app-main/docs/SECURITY.md) e [`docs/OCR_SETUP.md`](file:///c:/Users/Patrick/Music/app-main/docs/OCR_SETUP.md) para mais detalhes sobre configuração de CORS e credenciais.
