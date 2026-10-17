import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'co.kenyonexpress.store',
  appName: 'קניון אקספרס',
  webDir: '.next',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  ios: {
    scrollEnabled: false,
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#FED700',
      androidScaleType: 'centerInside',
      androidSpinnerStyle: 'large',
      splashFullScreen: true,
      splashImmersive: true,
      useDialog: true,
    },
    StatusBar: {
      style: 'lightContent',
      backgroundColor: '#FED700',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
