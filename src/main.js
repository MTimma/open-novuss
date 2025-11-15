import { mountNovussGame } from './components/NovussGame/NovussGame';
import './components/NovussGame/NovussGame.css';

const bootstrap = () => {
  const host = document.querySelector('#app');
  if (!host) {
    throw new Error('Unable to find #app container for Novuss game');
  }

  mountNovussGame(host);
};

bootstrap();
