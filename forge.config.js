const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './OIP',
    // Output para caminho mais curto para evitar erro de path
    out: 'C:\\temp\\mfe-build',
    // Removido: pasta nodes não deve ser empacotada - usuário baixa via app
    // extraResource: [
    //   './nodes'
    // ],
    win32metadata: {
      CompanyName: "Grupo Casas Bahia",
      FileDescription: "Gerenciador de Micro Front-Ends",
      ProductName: "Micro Front-End Manager",
      OriginalFilename: "micro-front-end-manager.exe",
      InternalName: "micro-front-end-manager",
      FileVersion: "0.9.5",
      ProductVersion: "0.9.5",
      CompanyName: "Grupo Casas Bahia",
      LegalCopyright: "Copyright © 2025 Juliano Soder",
    },
    // Configuração para assinatura automática com novo certificado - TEMPORARIAMENTE DESABILITADA
    // sign: {
    //   certificateFile: "./certs/micro-front-end-manager-new.pfx",
    //   certificatePassword: "MicroFE2025!",
    // },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'mfe_manager', // Nome mais curto para reduzir caminho
        authors: 'Juliano Soder',
        exe: 'micro-front-end-manager.exe',
        setupExe: 'MFESetup.exe', // Nome mais curto
        setupIcon: './OIP.ico',
        shortcutName: 'Micro Front-End Manager',
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        noMsi: true,
        remoteReleases: false,
        // Forçar diretório de trabalho temporário mais curto
        outputDirectory: 'C:\\temp\\mfe-out',
        // Certificado
        certificateFile: './certs/micro-front-end-manager-new.pfx',
        certificatePassword: 'MicroFE2025!',
        copyright: 'Copyright © 2025 Juliano Soder',
        description: 'Instalador do MFE Manager',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Juliano Soder',
          homepage: 'https://github.com/Juliano-Soder/Micro-Front-End-Manager',
          description: 'Gerenciador de Micro Front-Ends para desenvolvimento',
          productName: 'Micro Front-End Manager',
          genericName: 'Micro Frontend Manager',
          categories: ['Development', 'Utility'],
          icon: './OIP.png', // Para Linux, use PNG
          section: 'devel',
          priority: 'optional',
          depends: [],
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          maintainer: 'Juliano Soder',
          homepage: 'https://github.com/Juliano-Soder/Micro-Front-End-Manager',
          description: 'Gerenciador de Micro Front-Ends para desenvolvimento',
          productName: 'Micro Front-End Manager',
          genericName: 'Micro Frontend Manager',
          categories: ['Development', 'Utility'],
          icon: './OIP.png', // Para Linux, use PNG
          license: 'MIT',
          group: 'Development/Tools',
        },
      },
    },
    {
      name: '@electron-forge/maker-flatpak',
      config: {
        options: {
          maintainer: 'Juliano Soder',
          homepage: 'https://github.com/Juliano-Soder/Micro-Front-End-Manager',
          description: 'Gerenciador de Micro Front-Ends para desenvolvimento',
          productName: 'Micro Front-End Manager',
          genericName: 'Micro Frontend Manager',
          categories: ['Development', 'Utility'],
          icon: './OIP.png', // Para Linux, use PNG
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
