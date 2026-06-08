import { PanelPlugin } from '@grafana/data';
import { FloatingWindow } from './components/FloatingWindow';

export const plugin = new PanelPlugin(FloatingWindow).setPanelOptions(builder => {
  return builder
    .addTextInput({
      path: 'apiKey',
      name: 'OpenAI API Key',
      description: 'Provide your OpenAI API key',
    })
    .addTextInput({
      path: 'aiUrl',
      name: 'OpenAI API URL',
      description: 'Default: https://api.openai.com/v1/chat/completions',
    });
});

