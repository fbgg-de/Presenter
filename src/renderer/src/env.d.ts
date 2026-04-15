/// <reference types="vite/client" />

type PresenterEnv = {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_BACKEND_URL_DEV?: string;
};

interface ImportMetaEnv extends PresenterEnv {}
