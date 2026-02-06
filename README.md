# Goals Tracker

A beautiful, minimalist desktop application for tracking your goals and time-wasting activities. Built with Electron, React, and TypeScript.

## Features

- 🎯 **Track Goals & Waste Time Activities** - Separate tabs for goals and time-wasting activities
- ✅ **Check Off Items** - Mark items as done; they'll gray out and move to the bottom
- 📱 **Clean, Dark UI** - Easy on the eyes with a gray color scheme
- 💾 **Auto-Save** - Everything saves to local storage automatically
- 🔄 **Daily Reset** - Checked items reset automatically each day
- 🎨 **Smooth Animations** - Beautiful transitions and hover effects
- 📦 **Desktop App** - Stays on top of other windows, packagable as an EXE

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone or navigate to the project directory:
   ```bash
   cd Goals
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Run the development server:
```bash
npm start
```

This will start both the React development server and the Electron app.

### Building for Production

Build and package as an EXE:
```bash
npm run build
```

The executable will be created in the `dist` folder.

## Usage

1. **Switch Tabs** - Use the toggle buttons at the top to switch between Goals and Waste Time tracking
2. **Add Items** - Type in the input field and press Enter or click the + button
3. **Check Items** - Click the checkbox to mark items as complete
4. **Delete Items** - Click the trash icon to remove an item
5. **Auto-Save** - Everything is automatically saved to your computer

## Project Structure

```
src/
├── App.tsx         # Main app component
├── App.css         # App styling
├── main.ts         # Electron main process
├── preload.ts      # Electron preload script
├── index.tsx       # React entry point
└── index.css       # Global styles

public/
└── index.html      # HTML template
```

## Customization

- **Colors** - Edit `src/App.css` to change the gray color scheme
- **Window Size** - Modify `width` and `height` in `src/main.ts` (createWindow function)
- **Window Behavior** - Adjust `alwaysOnTop` and other properties in `src/main.ts`

## Building

### For Windows (EXE)

```bash
npm run build
```

The app will be packaged as both an installer (NSIS) and portable EXE in the `dist` folder.

## Tips

- The app stores data in your user's local storage (application data folder)
- Completed items move to the bottom of the list for better organization
- All items reset at the start of each day but you can still see completed items
- The app always stays on top so you can reference your goals while working

## License

MIT

![App Screenshot](Screenshot%202026-02-05%20193121.png)

