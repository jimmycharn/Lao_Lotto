UPDATE submissions s
SET commission_amount = s.amount * (
  COALESCE(
    (us.lottery_settings->'thai'->(
      CASE s.bet_type
        WHEN 'front_top_1' THEN 'pak_top'
        WHEN 'middle_top_1' THEN 'pak_top'
        WHEN 'back_top_1' THEN 'pak_top'
        WHEN 'front_bottom_1' THEN 'pak_bottom'
        WHEN 'back_bottom_1' THEN 'pak_bottom'
        WHEN '2_spread' THEN '2_center'
        WHEN '2_tang' THEN '2_center'
        WHEN '2_teng' THEN '2_run'
        WHEN '2_have' THEN '2_run'
        WHEN '2_back' THEN '2_top'
        WHEN '2_front_single' THEN '2_front'
        ELSE s.bet_type
      END
    )->>'commission')::DECIMAL,
    15
  ) / 100.0
)
FROM lottery_rounds r,
     user_settings us
WHERE s.round_id = r.id
  AND us.user_id = s.user_id 
  AND us.dealer_id = r.dealer_id
  AND s.round_id = 'd506a9f2-c98c-434e-a603-b4a7697b86c2'
  AND s.is_deleted = FALSE;

-- Verify member 10019 commission in DB
SELECT 
  s.user_id,
  p.full_name,
  count(*) as sub_count,
  sum(s.amount) as total_amt,
  sum(s.commission_amount) as total_comm
FROM submissions s
JOIN profiles p ON p.id = s.user_id
WHERE s.round_id = 'd506a9f2-c98c-434e-a603-b4a7697b86c2'
  AND s.user_id = '363e7398-9c21-4cc7-a8a5-0736571ea193'
  AND s.is_deleted = FALSE
GROUP BY s.user_id, p.full_name;
