#!/bin/bash
# Monitor error rate for 15 minutes

DURATION=900  # 15 minutes
INTERVAL=10   # Check every 10 seconds
LOGFILE="logs/monitoring-start-$(date +%Y%m%d-%H%M%S).log"
START_TIME=$(date +%s)
TOTAL_REQUESTS=0
TOTAL_ERRORS=0

echo "Starting error rate monitoring (15 minutes)..."
echo "Target: http://localhost:3311"

while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  
  if [ $ELAPSED -ge $DURATION ]; then
    echo "Monitoring period complete"
    break
  fi
  
  # Make test requests to various routes
  curl -s http://localhost:3311/ > /dev/null 2>&1
  curl -s http://localhost:3311/api/catalog/categories > /dev/null 2>&1
  curl -s http://localhost:3311/cart > /dev/null 2>&1
  curl -s "http://localhost:3311/api/a" -X POST -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1
  
  TOTAL_REQUESTS=$((TOTAL_REQUESTS + 4))
  
  # Count errors in logs
  ERROR_COUNT=$(tail -50 "$LOGFILE" 2>/dev/null | grep -c '"level":"error"' || echo 0)
  
  if [ $ERROR_COUNT -gt $TOTAL_ERRORS ]; then
    TOTAL_ERRORS=$ERROR_COUNT
  fi
  
  # Calculate error rate
  if [ $TOTAL_REQUESTS -gt 0 ]; then
    ERROR_RATE=$(echo "scale=4; $TOTAL_ERRORS * 100 / $TOTAL_REQUESTS" | bc)
    echo "[$ELAPSED/$DURATION s] Errors: $TOTAL_ERRORS / Requests: $TOTAL_REQUESTS (Rate: $ERROR_RATE%)"
  fi
  
  if [ $ERROR_RATE -gt 0.5 ]; then
    echo "⚠️  ERROR RATE EXCEEDED 0.5% — Investigation required"
    break
  fi
  
  sleep $INTERVAL
done

echo "Final: $TOTAL_ERRORS errors in $TOTAL_REQUESTS requests"
