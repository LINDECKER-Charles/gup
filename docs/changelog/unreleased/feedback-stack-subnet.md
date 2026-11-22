# feedback-stack-subnet

## Fixed

- **feedback:** the production stack's private network gets a fixed subnet, `10.232.1.0/24`,
  outside the pools Docker hands out: the shared VPS had used up all 31 of them, and the first
  `docker compose up` failed with "all predefined address pools have been fully subnetted"
  (`fix(feedback): give the production stack a subnet outside Docker's pools`)
