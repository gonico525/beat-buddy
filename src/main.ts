import './style.css';
import { App } from './ui/app';
import { homeScreen } from './ui/screens/home';
import { perceptionScreen } from './ui/screens/perception';
import { wholebodyScreen } from './ui/screens/wholebody';
import { syncScreen } from './ui/screens/sync';
import { echoScreen } from './ui/screens/echo';
import { settingsScreen } from './ui/screens/settings';
import { debugScreen } from './ui/screens/debug';
import { storage } from './core/storage';

// sessionLog は直近1セッション分のみ (§10) — 起動時にリセット
storage.resetSessionLog();

const app = new App(document.getElementById('app')!);
app.register('home', homeScreen);
app.register('perception', perceptionScreen);
app.register('wholebody', wholebodyScreen);
app.register('sync', syncScreen);
app.register('echo', echoScreen);
app.register('settings', settingsScreen);
app.register('debug', debugScreen);
app.go('home');
