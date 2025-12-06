import { Routes } from '@angular/router';

const routes: Routes = [
	{
		path: '',
		loadComponent: () => import('./book-explorer.component'),
        title: 'Book Explorer'
	},
];

export default routes;
