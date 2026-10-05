import React from 'react';
import {createRoot} from 'react-dom/client';
import {Workspace} from '../../../src/app/AppShell';
import {user} from './client';
import '../../../src/style.css';
import '../../../src/styles/design-system.css';
createRoot(document.getElementById('root')).render(<Workspace session={{user:{id:user,email:'fixture@example.test'}}} openField={()=>{}}/>);
