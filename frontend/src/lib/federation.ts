import { init } from '@module-federation/enhanced/runtime';
import React from 'react';
import ReactDOM from 'react-dom';

export const federation = init({
  name: 'opsiforce_app',
  remotes: [],
  shared: {
    react: {
      scope: 'default',
      lib: () => React,
      shareConfig: {
        singleton: true,
        requiredVersion: '^18',
      },
    },
    'react-dom': {
      scope: 'default',
      lib: () => ReactDOM,
      shareConfig: {
        singleton: true,
        requiredVersion: '^18',
      },
    },
  },
});
