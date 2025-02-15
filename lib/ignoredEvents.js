import debug from 'debug';
const log = debug('chrome-har');

export function ignoreEvents(method) {
  switch (method) {
    case 'Network.webSocketCreated':
    case 'Network.webSocketFrameSent':
    case 'Network.webSocketFrameError':
    case 'Network.webSocketFrameReceived':
    case 'Network.webSocketClosed':
    case 'Network.webSocketHandshakeResponseReceived':
    case 'Network.webSocketWillSendHandshakeRequest': {
      // ignore, sadly HAR file format doesn't include web sockets
      break;
    }

    case 'Network.eventSourceMessageReceived': {
      // ignore
      break;
    }

    case 'Page.frameNavigated':
    case 'Page.frameStoppedLoading':
    case 'Page.frameClearedScheduledNavigation':
    case 'Page.frameDetached':
    case 'Page.frameResized': {
      // ignore
      break;
    }

    case 'Page.lifecycleEvent': {
      // ignore for now, put in pageTimings later
      break;
    }

    case 'Page.javascriptDialogOpening':
    case 'Page.javascriptDialogClosed':
    case 'Page.screencastFrame':
    case 'Page.screencastVisibilityChanged':
    case 'Page.colorPicked':
    case 'Page.interstitialShown':
    case 'Page.interstitialHidden': {
      // ignore
      break;
    }
    default: {
      log(`Unhandled event: ${method}`);
      break;
    }
  }
}
