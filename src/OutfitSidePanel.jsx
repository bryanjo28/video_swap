import { useMemo, useState } from "react";

const DUMMY_OUTFITS = [
  {
    id: "outfit-1",
    name: "Classic White",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='18' fill='%23f2f4ff'/><path d='M28 36l14-10h36l14 10-10 10v34c0 6-4 10-10 10H48c-6 0-10-4-10-10V46L28 36z' fill='%23ffffff' stroke='%23c9d3ff' stroke-width='3'/><path d='M48 26l12 10 12-10' fill='none' stroke='%23c9d3ff' stroke-width='3' stroke-linecap='round'/></svg>",
  },
  {
    id: "outfit-2",
    name: "Cool Blue",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='18' fill='%23e7f2ff'/><path d='M28 36l14-10h36l14 10-10 10v34c0 6-4 10-10 10H48c-6 0-10-4-10-10V46L28 36z' fill='%234f7bff' stroke='%233c65e8' stroke-width='3'/><path d='M48 26l12 10 12-10' fill='none' stroke='%23c2d1ff' stroke-width='3' stroke-linecap='round'/></svg>",
  },
  {
    id: "outfit-3",
    name: "Navy Formal",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='18' fill='%23eef1ff'/><path d='M28 36l14-10h36l14 10-10 10v34c0 6-4 10-10 10H48c-6 0-10-4-10-10V46L28 36z' fill='%2327376f' stroke='%231c2a59' stroke-width='3'/><path d='M48 26l12 10 12-10' fill='none' stroke='%239eb0e6' stroke-width='3' stroke-linecap='round'/><rect x='57' y='44' width='6' height='36' rx='3' fill='%23f4c34b'/></svg>",
  },
  {
    id: "outfit-4",
    name: "Soft Lavender",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='18' fill='%23f3eaff'/><path d='M28 36l14-10h36l14 10-10 10v34c0 6-4 10-10 10H48c-6 0-10-4-10-10V46L28 36z' fill='%23b07cff' stroke='%239460f0' stroke-width='3'/><path d='M48 26l12 10 12-10' fill='none' stroke='%23d7baff' stroke-width='3' stroke-linecap='round'/></svg>",
  },
  {
    id: "outfit-5",
    name: "Forest Green",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='18' fill='%23e8f7f0'/><path d='M28 36l14-10h36l14 10-10 10v34c0 6-4 10-10 10H48c-6 0-10-4-10-10V46L28 36z' fill='%2327a36a' stroke='%231d8a59' stroke-width='3'/><path d='M48 26l12 10 12-10' fill='none' stroke='%23bfead6' stroke-width='3' stroke-linecap='round'/></svg>",
  },
];

export default function OutfitSidePanel() {
  const [selectedId, setSelectedId] = useState(DUMMY_OUTFITS[0]?.id);
  const selectedIndex = useMemo(() => {
    return Math.max(0, DUMMY_OUTFITS.findIndex((item) => item.id === selectedId));
  }, [selectedId]);

  const handleSelect = (item) => {
    setSelectedId(item.id);
    console.log("Outfit selected:", item);
  };

  const moveOutfit = (direction) => {
    if (!DUMMY_OUTFITS.length) return;
    const nextIndex = Math.min(
      DUMMY_OUTFITS.length - 1,
      Math.max(0, selectedIndex + direction)
    );
    const nextItem = DUMMY_OUTFITS[nextIndex];
    if (!nextItem) return;
    setSelectedId(nextItem.id);
    console.log("Outfit moved:", nextItem);
  };

  return (
    <div className="sidePanel">
      <button
        className="sideArrow"
        type="button"
        onClick={() => moveOutfit(-1)}
        disabled={selectedIndex === 0}
      >
        ^
      </button>
      <div className="sideList">
        {DUMMY_OUTFITS.map((item) => (
          <button
            key={item.id}
            className={`outfitItem ${item.id === selectedId ? "isActive" : ""}`}
            type="button"
            onClick={() => handleSelect(item)}
          >
            <img className="outfitImg" src={item.image} alt={item.name} />
          </button>
        ))}
      </div>
      <button
        className="sideArrow"
        type="button"
        onClick={() => moveOutfit(1)}
        disabled={selectedIndex === DUMMY_OUTFITS.length - 1}
      >
        v
      </button>
    </div>
  );
}
