import {useEffect, useState, type ComponentType} from 'react';
import {ChevronDown} from 'lucide-react';
import type {NavigationGroup} from '../../app/navigation';

type Props = {
  groups: NavigationGroup[];
  items: readonly (readonly [string, ComponentType<{size?: number}>])[];
  page: string;
  label: (page:string)=>string;
  onNavigate: (page:string)=>void;
  unread: number;
};
export function SidebarNavigation({groups,items,page,label,onNavigate,unread}: Props) {
  const [closed,setClosed]=useState<string[]>(['More','Impact operations','System']);
  const activeGroup=groups.find(group=>group.pages.includes(page))?.label;
  useEffect(()=>{if(activeGroup)setClosed(old=>old.filter(name=>name!==activeGroup));},[activeGroup,page]);
  return <nav aria-label="Main navigation" className="workspace-navigation">
    {groups.map((group,index)=>{
      const collapsed=closed.includes(group.label);
      const panel=`sidebar-group-${index}`;
      return <section className={`nav-section${collapsed?' group-closed':''}`} key={group.label} aria-label={group.label}>
        <button type="button" className="nav-group-toggle" aria-expanded={!collapsed} aria-controls={panel}
          onClick={()=>setClosed(old=>collapsed?old.filter(name=>name!==group.label):[...old,group.label])}>
          <span>{group.label}</span><ChevronDown size={13}/>
        </button>
        <div id={panel} className="nav-group-items">
          {group.pages.map(name=>{
            const Icon=items.find(([id])=>id===name)?.[1];
            if(!Icon)return null;
            const title=label(name);
            const count=name==='Notifications'?unread:0;
            return <button type="button" key={name} className={`nav-item${page===name?' active':''}`} title={title}
              aria-label={count?`${title}, ${count} unread`:title} aria-current={page===name?'page':undefined} onClick={()=>onNavigate(name)}>
              <Icon size={19}/><span className="nav-item-label">{title}</span>
              {count>0&&<span className="nav-count" aria-hidden="true">{count>99?'99+':count}</span>}
            </button>;
          })}
        </div>
      </section>;
    })}
  </nav>;
}
