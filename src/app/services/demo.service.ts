import { Injectable } from '@angular/core';

/** Un paso del recorrido guiado. */
export interface PasoDemo {
  id: string;
  titulo: string;
  texto: string;
  /** Qué panel se muestra debajo del globo. */
  vista: 'carreras' | 'simulador' | 'favoritos' | 'reporte';
}

export interface CarreraDemo {
  nombre: string;
  institucion: string;
  region: string;
  puntajeCorte: number;
  arancel: string;
  duracion: string;
  afinidad: number;
}

/**
 * Datos y guion de la demo pública.
 *
 * Todo es ficticio y vive en el código: la demo no toca PostgreSQL ni la
 * sesión real. Así puede abrirse sin registro y no hay riesgo de que datos
 * de demostración lleguen a la base de producción.
 */
@Injectable({ providedIn: 'root' })
export class DemoService {
  /** Perfil precargado que ve quien recorre la demo. */
  readonly perfil = {
    nombre: 'Sofía',
    apellido: 'Reyes',
    curso: '4° Medio B',
    establecimiento: 'Liceo Bicentonario de Ejemplo',
    iniciales: 'SR',
  };

  readonly puntajes = {
    nem: 680,
    ranking: 712,
    lectora: 645,
    matematica: 701,
    ciencias: 658,
  };

  readonly carreras: CarreraDemo[] = [
    {
      nombre: 'Ingeniería Civil Industrial',
      institucion: 'Universidad de Chile',
      region: 'Metropolitana',
      puntajeCorte: 698,
      arancel: '$6.240.000',
      duracion: '11 semestres',
      afinidad: 92,
    },
    {
      nombre: 'Ingeniería en Informática',
      institucion: 'Universidad Técnica Federico Santa María',
      region: 'Valparaíso',
      puntajeCorte: 671,
      arancel: '$5.780.000',
      duracion: '10 semestres',
      afinidad: 88,
    },
    {
      nombre: 'Diseño Industrial',
      institucion: 'Universidad de Concepción',
      region: 'Biobío',
      puntajeCorte: 612,
      arancel: '$4.950.000',
      duracion: '10 semestres',
      afinidad: 74,
    },
  ];

  /** Lo que vería el equipo directivo en el reporte del nivel. */
  readonly reporte = {
    curso: '4° Medio B',
    estudiantes: 38,
    conSimulacion: 31,
    areasTop: [
      { area: 'Tecnología e Ingeniería', porcentaje: 34 },
      { area: 'Salud', porcentaje: 26 },
      { area: 'Ciencias Sociales', porcentaje: 18 },
      { area: 'Administración y Comercio', porcentaje: 13 },
      { area: 'Arte y Arquitectura', porcentaje: 9 },
    ],
    alertas: [
      '7 estudiantes aún no exploran ninguna carrera.',
      '12 tienen puntaje simulado bajo el corte de su primera opción.',
    ],
  };

  readonly pasos: PasoDemo[] = [
    {
      id: 'carreras',
      titulo: 'Explorador de carreras',
      texto:
        'Sofía busca entre más de 8.000 carreras y filtra por área, región e institución. Compara arancel, duración y puntaje de corte real.',
      vista: 'carreras',
    },
    {
      id: 'simulador',
      titulo: 'Simulador PAES',
      texto:
        'Ingresa sus puntajes y ve a qué carreras podría postular según las ponderaciones de cada una. Deja de adivinar.',
      vista: 'simulador',
    },
    {
      id: 'favoritos',
      titulo: 'Sus opciones guardadas',
      texto:
        'Guarda las carreras que le interesan y las compara lado a lado. El orientador puede trabajar sobre esa lista con ella.',
      vista: 'favoritos',
    },
    {
      id: 'reporte',
      titulo: 'Reporte Directivo',
      texto:
        'Esto es lo que recibe tu institución: cómo se distribuyen los intereses del nivel y qué estudiantes necesitan acompañamiento.',
      vista: 'reporte',
    },
  ];

  get totalPasos(): number {
    return this.pasos.length;
  }
}
