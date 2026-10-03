interface Props {
  tags: { tag: string; weight: number }[];
}

const TagCloud = ({ tags }: Props) => (
  <div className="flex flex-wrap gap-2">
    {tags.map((t) => {
      const size = 12 + Math.round(t.weight * 8);
      return (
        <span
          key={t.tag}
          className="rounded-pill bg-kinnso-ink px-3 py-1 font-semibold text-kinnso-cream"
          style={{ fontSize: `${size}px`, lineHeight: 1.4 }}
        >
          #{t.tag}
        </span>
      );
    })}
  </div>
);

export default TagCloud;
