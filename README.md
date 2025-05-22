# Astro AI DeepSeek

Bem-vindo ao projeto **Astro AI DeepSeek**! Este é um chatbot interativo desenvolvido com Astro, React e Tailwind CSS.

## 🚀 Como iniciar o projeto

Siga os passos abaixo para configurar e executar o projeto localmente:

### Pré-requisitos
- Node.js (versão 16 ou superior)
- PNPM (instale com `npm install -g pnpm`)

### Passos para iniciar
1. **Clone o repositório**:
   ```bash
   git clone https://github.com/seu-usuario/astro-ai-deepseek.git
   cd astro-ai-deepseek
   ```

2. **Instale as dependências**:
   ```bash
   pnpm install
   ```

3. **Inicie o servidor de desenvolvimento**:
   ```bash
   pnpm run dev
   ```

4. **Acesse o projeto no navegador**:
   Abra [ http://localhost:4321/](http://localhost:3000) para visualizar o projeto.

---

## 🛠️ Como fazer alterações no CSS

O projeto utiliza **Tailwind CSS** para estilização. Aqui estão algumas instruções para fazer alterações simples no CSS:

### Alterar o fundo ou cores globais
1. Abra o arquivo `src/layouts/Layout.astro`.
2. Localize o bloco `<style is:global>` e ajuste as variáveis CSS:
   ```css
   :root {
     --accent: 136, 58, 234;
     --accent-light: 224, 204, 250;
     --accent-dark: 49, 10, 101;
     --accent-gradient: linear-gradient(
       45deg,
       rgb(var(--accent)),
       rgb(var(--accent-light)) 30%,
       white 60%
     );
   }
   html {
     background: #f3f4f6; /* Cor de fundo clara */
     color: #000; /* Cor do texto */
   }
   ```

### Alterar estilos de componentes
1. Para alterar estilos de componentes específicos, abra o arquivo correspondente. Por exemplo:
   - `src/components/Chat.tsx` para o componente de chat.
   - `src/components/Card.astro` para os cartões.

2. Edite as classes Tailwind ou estilos CSS diretamente no arquivo. Exemplo:
   ```tsx
   <input
     type="text"
     className="flex-1 px-4 py-2 border rounded-md text-base bg-gray-700 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
   />
   ```

3. Salve o arquivo e recarregue o navegador para ver as alterações.

---

## 🔊 Voice Chat Features

This application supports voice input (Speech-to-Text) and voice output (Text-to-Speech) for interacting with the chatbot in Brazilian Portuguese (pt-BR).

**Key Information:**
*   **Speech-to-Text (STT)**: You can click the microphone button (🎤 Gravar) to speak your messages instead of typing. The button will change to "🎤 Parar" while recording.
*   **Text-to-Speech (TTS)**: The chatbot's responses will be automatically read aloud. While the assistant is speaking, the microphone button will be temporarily disabled and show "..." to indicate it's waiting.
*   **Language Support**: Voice features are configured for Brazilian Portuguese (pt-BR).
*   **Browser Support**: These features utilize the Web Speech API, which is best supported on modern browsers like Google Chrome and Microsoft Edge. Functionality, voice availability, and quality may vary depending on your browser and operating system.
*   **Microphone Access**: For voice input, your browser will prompt you for microphone permission when you first use the feature. This permission is required for STT to work.
*   **Error Notifications**: The interface will provide messages if issues occur, such as microphone permission being denied or if the Web Speech API is not supported by your browser for STT or TTS.

---

## 📂 Estrutura do projeto

- `src/components`: Contém os componentes React e Astro.
- `src/layouts`: Contém os layouts principais do projeto.
- `src/styles`: Contém o arquivo CSS global (`global.css`).
- `astro.config.mjs`: Configuração do Astro.
- `tailwind.config.js`: Configuração do Tailwind CSS.

---

## 🧩 Como contribuir

1. Faça um fork do repositório.
2. Crie uma branch para sua feature:
   ```bash
   git checkout -b minha-feature
   ```
3. Faça as alterações e commit:
   ```bash
   git commit -m "Descrição das alterações"
   ```
4. Envie um pull request.

---

## 📞 Suporte

Se você tiver dúvidas ou problemas, entre em contato com o mantenedor do projeto ou abra uma issue no repositório.

---
