# Security Best Practices for Financial App

## 🔐 Firebase Configuration Security

### Current Situation
Firebase API keys are currently exposed in `index.html`. While Firebase's security model uses rules to protect data, exposing credentials in production is still a security risk.

### Solution for Static Sites (HTML/CSS/JS only)

Since this is a vanilla HTML/CSS/JavaScript single-page app without a build process, here are your options:

#### Option 1: Use Firebase Security Rules (Recommended for now)
- Keep credentials in code (they're already public through the app anyway)
- Implement strong **Firebase Security Rules** to protect data
- **Never store user data without proper authentication**
- Users can only access their own data via `userId` checks in rules

#### Option 2: Setup Minimal Build Process (Vite/Webpack)
- Add `npm init` and install Vite/Webpack
- Use environment variables for all secrets
- Build process injects variables at build time
- Much better security for production

#### Option 3: Use a Backend API
- Move all Firebase logic to a server-side API
- Client only communicates with your secure backend
- Backend has the Firebase credentials (secured on server)

### Firebase Security Rules Template

Add these rules to your Firestore console following the pattern:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /transactions/{document=**} {
      allow read, write: if request.auth.uid == resource.data.userId
    }
    match /contasFixas/{document=**} {
      allow read, write: if request.auth.uid == resource.data.userId
    }
    match /goals/{document=**} {
      allow read, write: if request.auth.uid == resource.data.userId
    }
    // Prevent unauthorized access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Immediate Actions Taken

✅ Created `.env.local` file with template (see .env.local in project root)
✅ Created `.gitignore` to prevent credential commits
✅ Added memory leak fixes
✅ Enhanced input validation
✅ Added escapeHtml() function for XSS prevention

### Next Steps for Full Security

1. **Update Firebase Rules** - Copy the rules template above into your Firestore console
2. **Enable Authentication** - Ensure Google Sign-In is properly configured. To enable passwordless login, open Firebase Console > Authentication > Sign-in method, enable **Email/Password**, and enable **Email link (passwordless sign-in)**.
3. **Authorize domains** - In Authentication > Settings > Authorized domains, add `finance-control-dev.github.io` for the production app (and `localhost` or `127.0.0.1` for local development). The app sends production magic links back to `https://finance-control-dev.github.io/app/`; links tested locally will also return to production. Magic links will not work from `file://`.
4. **Test Data Access** - Verify users can only access their own data
5. **Setup Build Process** (Optional) - Move to Vite/Webpack for environment variable support
6. **Monitor Console** - Regular security audits using Firebase Console

To change the app name or Portuguese copy in Firebase sign-in emails, open Authentication > Templates > Email link sign-in and edit the template's sender name, subject, and message. Email delivery and spam placement are controlled by Firebase and the recipient's mail provider, not by the app's UI.

### Testing Firebase Rules

1. Go to Firebase Console > Firestore Database > Rules
2. Click "Rules" tab
3. Replace with template above
4. Click "Publish"
5. Test with Firestore Rules Simulator
