import React from 'react';
import { UserConfigProvider } from './contexts/UserConfigContext';
import { SettingsContainer } from './components/settings/settings-container';
import type { PlasmoCSConfig } from "plasmo"
import cssText from "data-text:~style.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

export const getStyle = (): HTMLStyleElement => {
  const baseFontSize = 16

  let updatedCssText = cssText.replaceAll(":root", ":host(plasmo-csui)")
  const remRegex = /([\d.]+)rem/g
  updatedCssText = updatedCssText.replace(remRegex, (match, remValue) => {
    const pixelsValue = parseFloat(remValue) * baseFontSize

    return `${pixelsValue}px`
  })

  const styleElement = document.createElement("style")

  styleElement.textContent = updatedCssText

  return styleElement
}
function Options() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Erpa Settings</h1>
          <p className="text-gray-400">
            Configure your Erpa extension preferences
          </p>
        </div>
        <UserConfigProvider>
          <SettingsContainer />
        </UserConfigProvider>
      </div>
    </div>
  );
}

export default Options;
