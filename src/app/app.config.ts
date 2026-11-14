import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCl from '@angular/common/locales/es-CL';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy } from '@ionic/angular';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app.routes';

/*
 * Idioma de fechas y números.
 *
 * Sin esto Angular usa inglés por defecto, y el calendario mostraba
 * "1 June 2025" en vez de "1 de junio de 2025". También afecta a los
 * montos: con es-CL el separador de miles es el punto, como en Chile.
 */
registerLocaleData(localeEsCl);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-CL' },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),

    provideRouter(routes, withPreloading(PreloadAllModules)),
  ],
};
