# 🔐 FitMask (Elite Edition)

A production-ready mobile-first web application that appears as a modern fitness tracking app but secretly contains a hidden anonymous private messaging system.

## 📋 Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Features in Detail](#features-in-detail)

## ✨ Features

### 🏋️ Public Fitness App
- **Dashboard**: Track calories, steps, water intake, and streaks.
- **Workouts**: Browse and start workout plans.
- **Stats**: View fitness progress over time.
- **Modern UI**: Clean, energetic aesthetic with smooth Framer Motion animations.

### 🔒 Hidden Vault (Secret Chat)
- **Secret Trigger**: Tap the profile avatar 5 times followed by a 3-second hold to activate.
- **Dual Auth**: Requires a separate 6-digit passcode to unlock the Vault JWT.
- **Stealth UI**: Matte black, glassmorphism, and minimal typography.
- **Encrypted Messaging**: All messages are AES-256 encrypted before being stored.
- **Identity controls**: Each user has a unique display name and public FitID (for example, `john_doe` or `john.doe`). Both can be updated from Profile.
- **Public/private Discovery**: Public profiles appear in Vault Discovery and can receive direct messages. Private profiles are hidden from Discovery and require an accepted DM request before messaging.
- **DM requests**: Incoming private-account requests appear directly at the top of the DM list, where they can be accepted or declined.
- **Conversation ordering**: DM contacts are sorted by their most recent message, with unread counts shown on each contact.
- **Panic Exit**: Triple-tap the top bar to instantly wipe sensitive state and return to the fitness app.
- **Real-time**: Powered by Socket.IO with typing indicators and online presence.
- **Mobile keyboard support**: The chat composer follows the visible mobile viewport so it remains above the on-screen keyboard.

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React, Vite, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons, Socket.io-client |
| **Backend** | Node.js, Express, MongoDB, Socket.io, JWT, Crypto |
| **Mobile** | PWA support, touch-optimized, mobile-first design |

## 📁 Project Structure

```
Chattingapp/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable React components
│   │   ├── context/        # Auth and Vault context
│   │   ├── layouts/        # Page layouts
│   │   ├── pages/          # Page components
│   │   ├── vault/          # Secret chat system
│   │   ├── App.tsx         # Main app component
│   │   └── main.tsx        # Entry point
│   ├── package.json
│   └── vite.config.ts
├── server/                 # Node.js/Express backend
│   ├── routes/             # API endpoints
│   ├── models/             # MongoDB schemas
│   ├── sockets/            # Socket.IO handlers
│   ├── middleware/         # Express middleware
│   ├── utils/              # Helper functions
│   ├── index.js            # Server entry point
│   └── package.json
├── shared/                 # Shared utilities
├── .gitignore
├── package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- MongoDB URI (local or cloud)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/arvindra78/Chattingapp.git
   cd Chattingapp
   ```

2. **Install root dependencies**
   ```bash
   npm install
   ```

3. **Install all sub-project dependencies**
   ```bash
   npm run install-all
   ```

4. **Configure environment variables** (see [Environment Variables](#environment-variables) section)

### Environment Variables

#### Backend (`server/.env`)
Create a `.env` file in the `server` directory:

```env
PORT=5000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_fitness_jwt_secret
VAULT_SECRET=your_vault_jwt_secret
MESSAGE_ENCRYPTION_KEY=32_char_encryption_key
CLIENT_URL=http://localhost:5173
VAPID_SUBJECT=mailto:you@example.com
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

#### Frontend (`client/.env`)
Create a `.env` file in the `client` directory:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

### Web Push setup

Install dependencies, then generate a VAPID key pair:

```bash
npm install
npx web-push generate-vapid-keys
```

Copy the generated public key, private key, and a contact URI (for example `mailto:you@example.com`) into the VAPID variables in `.env`. Never expose or commit the private key.

Users can enable or disable browser notifications from Profile. New-message notifications intentionally use generic text and open the relevant Vault chat when clicked.

### Running the Application

**Development Mode**
```bash
npm run dev
```

This will start both the frontend (port 5173) and backend (port 5000) in concurrent mode.

**Production Build**
```bash
npm run build
```

## 🎯 Features in Detail

### Secret Trigger Activation
1. Navigate to your profile
2. Tap the avatar image 5 times rapidly
3. Hold for 3 seconds
4. Enter your 6-digit passcode to unlock the Vault

### End-to-End Encryption
All messages are encrypted using AES-256 before transmission and storage. Encryption keys are derived from your vault passcode.

### Real-time Communication
Socket.IO enables real-time messaging with:
- Typing indicators
- Online/offline presence
- Message delivery confirmation
- Automatic reconnection handling

### Discovery and DM privacy

1. Set a unique **Display name** and **Public FitID** during sign-up or later in Profile. FitIDs accept 3-24 letters, numbers, dots, and underscores.
2. Use the **Public / Private** Discovery switch in Profile to control whether your FitID appears in Vault Discovery.
3. Public Discovery profiles can be opened and messaged directly.
4. Private profiles require the recipient to accept a DM request before messages can be sent.

Existing DM contacts remain available when a profile is switched to Private.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**Arvind Ra**
- GitHub: [@arvindra78](https://github.com/arvindra78)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/arvindra78/Chattingapp/issues).

## ⭐ Show Your Support

Give a ⭐ if you like this project!

## Deployment

### Render (Recommended)
1. **Backend**: Deploy `server/` as a Web Service.
2. **Frontend**: Deploy `client/` as a Static Site.
3. **Database**: Use MongoDB Atlas.

Ensure you set all environment variables in the Render dashboard.

## Security Note
This application is designed for private use (10-20 users). For production scale, further hardening of the Socket.IO events and rate limiting is recommended.
