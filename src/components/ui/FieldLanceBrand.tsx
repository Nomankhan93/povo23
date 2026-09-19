import wordmark from '../../assets/brand/fieldlance-wordmark.png';
import icon from '../../assets/brand/fieldlance-icon.png';
import {BRAND_NAME, BRAND_TAGLINE} from '../../app/brand';

export function FieldLanceBrand({compact=false}:{compact?:boolean}){
  return <div className={compact?'fieldlance-brand fieldlance-brand-compact':'fieldlance-brand'}>
    <img
      src={compact?icon:wordmark}
      width={compact?1254:2048}
      height={compact?1254:682}
      alt={compact?`${BRAND_NAME} icon`:`${BRAND_NAME} — ${BRAND_TAGLINE}`}
      decoding="async"
    />
    {compact&&<strong aria-hidden="true">{BRAND_NAME}</strong>}
  </div>;
}
