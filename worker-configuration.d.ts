interface Env {
  RUNNING_IN_DOCKER: Settings;
  DEFAULT_NUM_CTX: Settings;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  GROQ_API_KEY: string;
  HuggingFace_API_KEY: string;
  OPEN_ROUTER_API_KEY: string;
  OLLAMA_API_BASE_URL: string;
  OPENAI_LIKE_API_KEY: string;
  OPENAI_LIKE_API_BASE_URL: string;
  TOGETHER_API_KEY: string;
  TOGETHER_API_BASE_URL: string;
  DEEPSEEK_API_KEY: string;
  LMSTUDIO_API_BASE_URL: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  MISTRAL_API_KEY: string;
  XAI_API_KEY: string;
  PERPLEXITY_API_KEY: string;
  AWS_BEDROCK_CONFIG: string;
  // AWS SSO / Credential Chain Configuration
  AWS_BEDROCK_REGION: string;
  AWS_BEDROCK_USE_CREDENTIAL_CHAIN: string;
  AWS_REGION: string;
  AWS_DEFAULT_REGION: string;
  AWS_PROFILE: string;
  // Standard AWS credentials (used by credential chain)
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SESSION_TOKEN: string;
}
