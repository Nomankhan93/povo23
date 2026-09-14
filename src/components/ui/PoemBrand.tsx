import wordmark from '../../assets/brand/poem-wordmark.jpeg';
import emblem from '../../assets/brand/poem-emblem.jpeg';
export function PoemBrand({compact=false}:{compact?:boolean}){
 return <div className={compact?'poem-brand poem-brand-compact':'poem-brand'}><img src={compact?emblem:wordmark} width={compact?1020:1426} height={compact?1020:537} alt="POEM — Participatory Organization for Empowering Marginalized" decoding="async"/>{compact&&<strong aria-hidden="true">POEM</strong>}</div>;
}
