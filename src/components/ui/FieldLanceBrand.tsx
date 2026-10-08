import {BRAND_NAME, BRAND_TAGLINE} from '../../app/brand';

const wordmark = '/fieldlance-wordmark.webp';
const icon = '/fieldlance-icon-192.png';

type FieldLanceBrandVariant = 'wordmark' | 'compact' | 'icon';

export function FieldLanceBrand({variant='wordmark'}:{variant?:FieldLanceBrandVariant}){
  const label = variant === 'wordmark' ? `${BRAND_NAME} — ${BRAND_TAGLINE}` : BRAND_NAME;
  if(variant === 'wordmark'){
    return <div role="img" className="fieldlance-brand fieldlance-brand-wordmark" aria-label={label}>
      <img className="fieldlance-wordmark-image" src={wordmark} width={768} height={256} alt="" aria-hidden="true" decoding="async" />
    </div>;
  }
  if(variant === 'icon'){
    return <div role="img" className="fieldlance-brand fieldlance-brand-icon" aria-label={label}>
      <img className="fieldlance-icon-image" src={icon} width={192} height={192} alt="" aria-hidden="true" decoding="async" />
    </div>;
  }
  return <div role="img" className="fieldlance-brand fieldlance-brand-compact" aria-label={label}>
    <img className="fieldlance-icon-image" src={icon} width={192} height={192} alt="" aria-hidden="true" decoding="async" />
    <span className="fieldlance-brand-copy"><strong>{BRAND_NAME}</strong></span>
  </div>;
}
