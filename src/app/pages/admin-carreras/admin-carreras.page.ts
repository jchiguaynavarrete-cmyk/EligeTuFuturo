import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
} from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';

import { CarrerasService, CarreraDoc } from '../../services/carreras.service';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';

@Component({
  selector: 'app-admin-carreras',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
  ],
  templateUrl: './admin-carreras.page.html',
  styleUrls: ['./admin-carreras.page.scss'],
})
export class AdminCarrerasPage implements OnInit {
  private carrerasService = inject(CarrerasService);

  carreras: CarreraDoc[] = [];
  filtradas: CarreraDoc[] = [];

  searchTerm = '';
  vista: 'activas' | 'inactivas' | 'todas' = 'activas';

  pageSize = 50;

  // ✅ TIPADO COMPATIBLE CON getDocs() / AngularFire
  cursor: QueryDocumentSnapshot<any> | null = null;

  cargando = false;

  ngOnInit() {
    void this.recargar();
  }

  async recargar(): Promise<void> {
    this.carreras = [];
    this.filtradas = [];
    this.cursor = null;
    await this.cargarMas(true);
  }

  async cargarMas(reset = false): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;

    try {
      const res = await this.carrerasService.getCarrerasAdminPage({
        vista: this.vista,
        pageSize: this.pageSize,
        cursor: reset ? null : this.cursor,
      });

      this.carreras = [...this.carreras, ...res.items];
      this.cursor = res.cursor;

      this.aplicarFiltros();
    } catch (err: unknown) {
      console.error('Admin carreras cargarMas error:', err);
    } finally {
      this.cargando = false;
    }
  }

  onVistaChange(): void {
    void this.recargar();
  }

  aplicarFiltros(): void {
    const term = (this.searchTerm || '').toLowerCase().trim();

    this.filtradas = this.carreras.filter((c) => {
      if (!term) return true;

      return (
        (c.carrera || '').toLowerCase().includes(term) ||
        (c.nombre_institucion || '').toLowerCase().includes(term) ||
        (c.sede || '').toLowerCase().includes(term) ||
        (c.region_sede || '').toLowerCase().includes(term) ||
        (c.area_cineunesco || '').toLowerCase().includes(term) ||
        (c.horario || '').toLowerCase().includes(term) ||
        (c.codigo_carrera || '').toLowerCase().includes(term)
      );
    });
  }

  trackById(_: number, c: CarreraDoc): string {
    return c.id;
  }

  async toggleActiva(c: CarreraDoc, ev: Event): Promise<void> {
    ev.stopPropagation();

    const accion = c.activa ? 'desactivar' : 'activar';
    const ok = confirm(`¿Seguro que deseas ${accion} "${c.carrera}"?`);
    if (!ok) return;

    await this.carrerasService.setCarreraActiva(c.id, !c.activa);

    // ✅ actualizar local sin recargar toda la lista
    const idx = this.carreras.findIndex((x) => x.id === c.id);
    if (idx >= 0) this.carreras[idx] = { ...this.carreras[idx], activa: !c.activa };

    this.aplicarFiltros();
  }

  get totalCargadas(): number {
    return this.carreras.length;
  }

  get puedeCargarMas(): boolean {
    return !!this.cursor && !this.cargando;
  }
}
