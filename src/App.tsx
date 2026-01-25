import { Board } from './components/Board';
import './styles/App.css';

const isDev = import.meta.env.DEV;

function App() {
  return (
    <div className={isDev ? 'app-dev-mode' : ''}>
      {isDev && <div className="dev-mode-indicator">DEV MODE</div>}
      <div className="drag-region" />
      <Board />
    </div>
  );
}

export default App;
