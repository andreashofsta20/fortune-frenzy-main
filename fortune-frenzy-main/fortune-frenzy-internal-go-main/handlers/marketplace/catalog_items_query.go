package marketplace

// SQL fragment: items row + average resale price + copy count.
const catalogItemsSelect = `
SELECT i.id, i.asset_id, i.name, i.creator, i.description,
  COALESCE(lstats.avg_price, 0),
  i.total_unboxed, i.maximum_copies, i.value, i.created_at, i.updated_at, i.color, i.category,
  COALESCE(cstats.cnt, 0),
  COALESCE(i.allow_direct_shop_purchase, 1)
FROM items i
LEFT JOIN (
  SELECT item_id, CAST(ROUND(AVG(price)) AS SIGNED) AS avg_price
  FROM item_listings
  GROUP BY item_id
) lstats ON lstats.item_id = i.id
LEFT JOIN (
  SELECT item_id, COUNT(*) AS cnt FROM item_copies GROUP BY item_id
) cstats ON cstats.item_id = i.id`
