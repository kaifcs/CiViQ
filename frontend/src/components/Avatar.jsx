// User avatar: a photo when one exists, initials otherwise. Sizes are a fixed
// token set rather than free-form props, so avatars stay consistent across the
// navbar, tables and detail panels.
const sizeConfig = {
  sm: { box: 'w-6 h-6', text: 'text-[10px]', dot: 'w-[7px] h-[7px]', dotPos: '-bottom-[1px] -right-[1px]', border: 'border-[1.5px]' },
  md: { box: 'w-8 h-8', text: 'text-[11px]', dot: 'w-[8px] h-[8px]', dotPos: '-bottom-[1px] -right-[1px]', border: 'border-[1.5px]' },
  lg: { box: 'w-10 h-10', text: 'text-[13px]', dot: 'w-[10px] h-[10px]', dotPos: 'bottom-0 right-0', border: 'border-2' },
  xl: { box: 'w-[52px] h-[52px]', text: 'text-[16px]', dot: 'w-[12px] h-[12px]', dotPos: 'bottom-[1px] right-[1px]', border: 'border-2' },
}

export default function Avatar({ initials = '?', src, size = 'md', online = false, alt = '' }) {
  const s = sizeConfig[size]

  return (
    <div className="relative inline-flex flex-shrink-0">
      <div className={[s.box, 'rounded-full flex items-center justify-center overflow-hidden bg-[#F4F4F5] dark:bg-[#1C1C1F] border border-[#E4E4E7] dark:border-[#27272A] transition-colors duration-150'].join(' ')}>
        {src ? (
          <img src={src} alt={alt || initials} className="w-full h-full object-cover" />
        ) : (
          <span className={[s.text, 'font-medium select-none leading-none text-[#71717A] dark:text-[#52525B]'].join(' ')}>
            {initials.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      {online && (
        <span className={[s.dot, s.dotPos, s.border, 'absolute rounded-full bg-[#16A34A] border-[#FFFFFF] dark:border-[#141414]'].join(' ')} />
      )}
    </div>
  )
}
