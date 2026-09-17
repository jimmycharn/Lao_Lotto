-- Test the corrected logic on submissions of Prae in round d506a9f2-c98c-434e-a603-b4a7697b86c2
SELECT 
  id,
  bet_type,
  numbers,
  amount,
  prize_amount,
  is_winner,
  -- Check if 2_run matches v_3_top ('640')
  CASE 
    WHEN bet_type = '2_run' AND length(numbers) = 2 THEN
      (position(substring(numbers from 1 for 1) in '640') > 0 AND 
       position(substring(numbers from 2 for 1) in '640') > 0)
    ELSE is_winner
  END as should_be_winner
FROM submissions
WHERE user_id = '3f7af007-9842-4ac7-89e2-ae92b2c04f92'
  AND round_id = 'd506a9f2-c98c-434e-a603-b4a7697b86c2'
  AND is_deleted = false
  AND (
    is_winner = true OR 
    (bet_type = '2_run' AND (position(substring(numbers from 1 for 1) in '640') > 0 AND position(substring(numbers from 2 for 1) in '640') > 0))
  );
