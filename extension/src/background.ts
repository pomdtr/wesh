type Message = {
  id: string;
  payload?: {
    command: string;
    [key: string]: any;
  };
  error?: string;
};

enum ContextMenuID {
  OPEN_TERMINAL_TAB = "open-terminal-tab",
  OPEN_TERMINAL_WINDOW = "open-terminal-window",
}

// activate when installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated");
  chrome.contextMenus.create({
    id: ContextMenuID.OPEN_TERMINAL_TAB,
    title: "Open Terminal in New Tab",
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: ContextMenuID.OPEN_TERMINAL_WINDOW,
    title: "Open Terminal in New Window",
    contexts: ["action"],
  });
});

// activate when chrome starts
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser started");
});

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type !== "popup") {
    return;
  }

  const tab = await chrome.tabs.query({ active: true, currentWindow: true });

  return tab[0].url;
});

chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({
    url: chrome.runtime.getURL("src/index.html"),
  });
});

const port = chrome.runtime.connectNative("com.pomdtr.wesh");
port.onMessage.addListener(async (msg: Message) => {
  console.log("Received message", msg);
  try {
    const res = await handleMessage(msg.payload);
    port.postMessage({
      id: msg.id,
      payload: res,
    });
  } catch (e: any) {
    port.postMessage({
      id: msg.id,
      error: e.message,
    });
  }
});

async function handleMessage(payload: any): Promise<any> {
  switch (payload.command) {
    case "fetch": {
      let tabId: number;
      if (payload.pattern) {
        const tabs = await chrome.tabs.query({
          url: payload.pattern,
        });
        if (tabs.length === 0) {
          throw new Error(`No tabs matching ${payload.pattern}`);
        }

        tabId = tabs[0].id!;
      } else {
        tabId = await getActiveTabId();
        if (tabId === undefined) {
          throw new Error("No active tab");
        }
      }

      const res = await chrome.scripting.executeScript({
        target: { tabId },
        args: [payload.url],
        func: async (url: string) => {
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`Fetch failed: ${res.statusText}`);
          }

          if (res.headers.get("Content-Type")?.includes("application/json")) {
            return res.json();
          }

          return res.text();
        },
      });

      return res[0].result;
    }
    case "tab.list": {
      if (payload.allWindows) {
        return await chrome.tabs.query({});
      }

      if (payload.windowId !== undefined) {
        return await chrome.tabs.query({ windowId: payload.windowId });
      }

      return await chrome.tabs.query({ currentWindow: true });
    }
    case "tab.get": {
      let { tabId } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }
      return await chrome.tabs.get(tabId);
    }
    case "tab.pin": {
      let { tabIds } = payload;
      if (tabIds === undefined) {
        tabIds = [await getActiveTabId()];
      }

      for (const tabId of tabIds) {
        await chrome.tabs.update(tabId, { pinned: true });
      }

      return;
    }
    case "tab.unpin": {
      let { tabIds } = payload;
      if (tabIds === undefined) {
        tabIds = [await getActiveTabId()];
      }

      for (const tabId of tabIds) {
        await chrome.tabs.update(tabId, { pinned: false });
      }

      return;
    }
    case "tab.focus": {
      const { tabId } = payload;
      const tab = await chrome.tabs.update(tabId, { active: true });
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      return;
    }
    case "tab.remove": {
      let { tabIds } = payload;
      if (tabIds === undefined) {
        tabIds = [await getActiveTabId()];
      }
      await chrome.tabs.remove(tabIds);
      return;
    }
    case "tab.reload": {
      let { tabIds } = payload;
      if (tabIds === undefined) {
        tabIds = [await getActiveTabId()];
      }
      for (const tabId of tabIds) {
        await chrome.tabs.reload(tabId);
      }
      return;
    }
    case "tab.update": {
      let { tabId, url } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }
      await chrome.tabs.update(tabId, { url });
      return;
    }
    case "tab.create": {
      const { url, urls } = payload;
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow.id === undefined) {
        throw new Error("Current window not found");
      }

      if (url !== undefined) {
        await chrome.tabs.create({ url, windowId: currentWindow.id });
        await chrome.windows.update(currentWindow.id, { focused: true });
        return;
      }

      for (const url of urls) {
        await chrome.tabs.create({ url, windowId: currentWindow.id });
      }

      await chrome.windows.update(currentWindow.id, { focused: true });
      return;
    }
    case "tab.source": {
      let { tabId } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }

      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return document.documentElement.outerHTML;
        },
      });

      return res[0].result;
    }
    case "selection.get": {
      let { tabId } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }

      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return window.getSelection()?.toString() || "";
        },
      });

      return res[0].result;
    }
    case "selection.set": {
      let { tabId, text } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }

      console.log(`setting input to ${text}`);
      await chrome.scripting.executeScript({
        target: { tabId },
        args: [text],
        func: (text) => {
          // Get the current selection
          const selection = window.getSelection();
          if (!selection) {
            return;
          }

          if (selection.rangeCount > 0) {
            // Get the first range of the selection
            const range = selection.getRangeAt(0);

            // Create a new text node as replacement
            const newNode = document.createTextNode(text);

            // Replace the selected range with the new node
            range.deleteContents();
            range.insertNode(newNode);

            // Adjust the selection to the end of the inserted node
            range.collapse(false);

            // Clear any existing selection
            selection.removeAllRanges();

            // Add the modified range to the selection
            selection.addRange(range);
          }
        },
      });

      return;
    }
    case "window.list": {
      return chrome.windows.getAll({});
    }
    case "window.focus": {
      const { windowId } = payload;
      return await chrome.windows.update(windowId, {
        focused: true,
      });
    }
    case "window.remove": {
      const { windowId } = payload;
      await chrome.windows.remove(windowId);
      return;
    }
    case "window.create": {
      const { url } = payload;
      return await chrome.windows.create({ url });
    }
    case "extension.list": {
      return await chrome.management.getAll();
    }
    case "bookmark.list": {
      return await chrome.bookmarks.getTree();
    }
    case "bookmark.create": {
      const { parentId, title, url } = payload;
      return chrome.bookmarks.create({
        parentId,
        title,
        url,
      });
    }
    case "bookmark.remove": {
      const { id } = payload;
      chrome.bookmarks.remove(id);
      return;
    }
    case "download.list": {
      return await chrome.downloads.search({});
    }
    case "history.search": {
      return chrome.history.search({ text: payload.query });
    }
    default: {
      throw new Error(`Unknown command: ${payload.command}`);
    }
  }
}

async function getActiveTabId() {
  const activeTabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tabId = activeTabs[0].id;
  if (tabId === undefined) {
    throw new Error("Active tab not found");
  }
  return tabId;
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  const mainPage = "/src/index.html";
  switch (info.menuItemId) {
    case ContextMenuID.OPEN_TERMINAL_TAB: {
      await chrome.tabs.create({ url: mainPage });
      break;
    }
    case ContextMenuID.OPEN_TERMINAL_WINDOW: {
      await chrome.windows.create({ url: mainPage });
      break;
    }
    default: {
      throw new Error(`Unknown menu item: ${info.menuItemId}`);
    }
  }
});

chrome.omnibox.onInputStarted.addListener(async () => {
  chrome.omnibox.setDefaultSuggestion({
    description: "Run command",
  });
});

chrome.omnibox.onInputChanged.addListener(async (text) => {
  chrome.omnibox.setDefaultSuggestion({
    description: `Run: ${text}`,
  });
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const url = `/src/index.html?command=${encodeURIComponent(text)}`;
  switch (disposition) {
    case "currentTab":
      await chrome.tabs.update({ url });
      break;
    case "newForegroundTab":
      await chrome.tabs.create({ url });
      break;
    case "newBackgroundTab":
      const displays = await chrome.system.display.getInfo();
      const display = displays[0];
      // get the width and height of the display
      const { width, height } = display.workArea;
      chrome.windows.create({
        url: `${url}&popup=true`,
        type: "popup",
        top: (height - 500) / 2,
        left: (width - 750) / 2,
        width: 750,
        height: 500,
      });
      break;
  }
});
